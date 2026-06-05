import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDbAsync } from "@/lib/db-compat";

const COOKIE_NAME = "ca_session";
const SESSION_TTL_HOURS = 24 * 14;

export type UserRole = "owner" | "admin" | "head" | "manager";

export interface SessionUser {
  id: number;
  tenantId: number;
  login: string;
  role: UserRole;
  name: string | null;
  email: string | null;
  bitrixManagerId: string | null;
}

/**
 * Гарантируем что ADMIN_LOGIN / ADMIN_PASSWORD_HASH подгружены — нужно для
 * первичного посева owner-пользователя при старте на новой инсталляции.
 */
function ensureAdminEnv() {
  if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD_HASH) return;
  const tryPaths = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), ".env.local"),
    "/home/maria/call-agent/.env",
    "/var/www/call-agent/.env",
  ];
  for (const p of tryPaths) {
    if (!fs.existsSync(p)) continue;
    try {
      for (const rawLine of fs.readFileSync(p, "utf8").split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        let v = line.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k && v && !process.env[k]) process.env[k] = v;
      }
      if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD_HASH) return;
    } catch {}
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = getDbAsync();
  const row = await db
    .prepare(
      `SELECT s.user_id, s.tenant_id as session_tenant, s.user as legacy_login
       FROM sessions s
       WHERE s.id = ? AND s.expires_at > datetime('now')`
    )
    .get<{ user_id: number | null; session_tenant: number | null; legacy_login: string | null }>(token);
  if (!row) return null;

  // Новая схема: ищем по user_id
  if (row.user_id) {
    const u = await db
      .prepare(
        `SELECT id, tenant_id, login, role, name, email, bitrix_manager_id, is_active
         FROM users WHERE id = ?`
      )
      .get<{ id: number; tenant_id: number; login: string; role: UserRole;
            name: string | null; email: string | null; bitrix_manager_id: string | null; is_active: number }>(row.user_id);
    if (!u || !u.is_active) return null;
    return {
      id: u.id,
      tenantId: u.tenant_id,
      login: u.login,
      role: u.role,
      name: u.name,
      email: u.email,
      bitrixManagerId: u.bitrix_manager_id,
    };
  }

  // Legacy путь — сессия создана старым кодом, по логину. Подтянем из users по логину.
  ensureAdminEnv();
  if (!row.legacy_login) return null;
  const u = await db
    .prepare(
      `SELECT id, tenant_id, login, role, name, email, bitrix_manager_id, is_active
       FROM users WHERE login = ? LIMIT 1`
    )
    .get<{ id: number; tenant_id: number; login: string; role: UserRole;
          name: string | null; email: string | null; bitrix_manager_id: string | null; is_active: number }>(row.legacy_login);
  if (!u || !u.is_active) return null;
  return {
    id: u.id,
    tenantId: u.tenant_id,
    login: u.login,
    role: u.role,
    name: u.name,
    email: u.email,
    bitrixManagerId: u.bitrix_manager_id,
  };
}

/** Создаёт сессию для пользователя по login+password. Возвращает true/false. */
export async function login(loginRaw: string, password: string): Promise<boolean> {
  ensureAdminEnv();
  const db = getDbAsync();

  // 1. Пытаемся через users-таблицу
  const u = await db
    .prepare(
      `SELECT id, tenant_id, password_hash, is_active
       FROM users WHERE login = ? LIMIT 1`
    )
    .get<{ id: number; tenant_id: number; password_hash: string; is_active: number }>(loginRaw.trim());
  if (!u || !u.is_active) return false;

  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return false;

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  await db
    .prepare(
      `INSERT INTO sessions (id, user, user_id, tenant_id, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(token, loginRaw.trim(), u.id, u.tenant_id, expires.toISOString().replace("T", " ").slice(0, 19));

  // Обновляем last_login для отслеживания активности
  await db.prepare(`UPDATE users SET updated_at = datetime('now') WHERE id = ?`).run(u.id);

  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return true;
}

export async function logout() {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (token) {
    await getDbAsync().prepare(`DELETE FROM sessions WHERE id = ?`).run(token);
  }
  c.delete(COOKIE_NAME);
}

/** Хелпер для route handlers — возвращает 401 если нет сессии */
export async function guard(): Promise<Response | null> {
  const u = await getSessionUser();
  if (!u) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/** Хелпер: 401 если нет сессии, 403 если роль не подходит */
export async function guardRole(allowedRoles: UserRole[]): Promise<Response | null> {
  const u = await getSessionUser();
  if (!u) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  if (!allowedRoles.includes(u.role)) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

/** True для owner/admin (могут управлять настройками/пользователями) */
export function canManage(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

/** True для owner/admin/head (видят данные всей команды) */
export function canViewTeam(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "head";
}

/**
 * @deprecated Заменён на guard() / guardRole().
 * Оставлен для обратной совместимости пока миграция всех вызовов идёт постепенно.
 */
export async function requireUser(): Promise<SessionUser | null> {
  return await getSessionUser();
}
