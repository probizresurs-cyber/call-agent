import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "./db";

/**
 * Гарантируем что ADMIN_LOGIN / ADMIN_PASSWORD_HASH подгружены.
 * Next.js обычно сам читает .env, но при запуске через PM2 в нестандартных
 * окружениях это иногда не срабатывает — делаем явный фолбэк.
 */
function ensureAdminEnv() {
  if (process.env.ADMIN_LOGIN && process.env.ADMIN_PASSWORD_HASH) return;
  // ищем .env в нескольких типичных местах
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

const COOKIE_NAME = "ca_session";
const SESSION_TTL_HOURS = 24 * 14;

export type SessionUser = { user: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT user, expires_at FROM sessions WHERE id = ? AND expires_at > datetime('now')`
    )
    .get(token) as { user: string; expires_at: string } | undefined;
  if (!row) return null;
  return { user: row.user };
}

export async function login(loginRaw: string, password: string): Promise<boolean> {
  ensureAdminEnv();
  const expectedLogin = process.env.ADMIN_LOGIN || "";
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!expectedLogin || !expectedHash) {
    throw new Error("ADMIN_LOGIN / ADMIN_PASSWORD_HASH не заданы в .env");
  }
  if (loginRaw.trim() !== expectedLogin) return false;
  const ok = await bcrypt.compare(password, expectedHash);
  if (!ok) return false;

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  getDb()
    .prepare(`INSERT INTO sessions (id, user, expires_at) VALUES (?, ?, ?)`)
    .run(token, expectedLogin, expires.toISOString().replace("T", " ").slice(0, 19));

  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/call-agent",
    expires,
  });
  return true;
}

export async function logout() {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (token) {
    getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(token);
  }
  c.delete(COOKIE_NAME);
}

/**
 * Используется в route handlers и Server Actions.
 * Возвращает либо пользователя, либо null (а не throw),
 * потому что throw Response не всегда корректно ловится Next.js в App Router.
 */
export async function requireUser(): Promise<SessionUser | null> {
  return await getSessionUser();
}

/**
 * Хелпер для route handlers: либо сразу отдаёт NextResponse 401,
 * либо возвращает null если можно идти дальше.
 */
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
