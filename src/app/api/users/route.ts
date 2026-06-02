/**
 * GET — список пользователей текущего тенанта (для owner/admin)
 * POST — создать пользователя
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser, canManage, type UserRole } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(u.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const db = getDbAsync();
  const rows = await db
    .prepare(
      `SELECT
         u.id, u.login, u.role, u.name, u.email, u.is_active,
         u.bitrix_manager_id,
         m.name AS bitrix_manager_name,
         u.updated_at
       FROM users u
       LEFT JOIN managers m ON m.id = u.bitrix_manager_id
       WHERE u.tenant_id = ?
       ORDER BY
         CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'head' THEN 2 ELSE 3 END,
         u.name, u.login`
    )
    .all(u.tenantId);
  return NextResponse.json({ ok: true, items: rows });
}

const ROLES: UserRole[] = ["owner", "admin", "head", "manager"];

export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(u.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    login?: string; password?: string; role?: UserRole;
    name?: string; email?: string; bitrix_manager_id?: string | null;
  };
  if (!body.login || !body.password) {
    return NextResponse.json({ ok: false, error: "login и password обязательны" }, { status: 400 });
  }
  if (body.password.length < 6) {
    return NextResponse.json({ ok: false, error: "пароль минимум 6 символов" }, { status: 400 });
  }
  const role: UserRole = ROLES.includes(body.role as UserRole) ? body.role as UserRole : "manager";
  // Только owner может создавать другого owner
  if (role === "owner" && u.role !== "owner") {
    return NextResponse.json({ ok: false, error: "только owner может создать owner" }, { status: 403 });
  }

  const db = getDbAsync();
  const exists = await db.prepare(`SELECT 1 FROM users WHERE tenant_id = ? AND login = ?`)
    .get(u.tenantId, body.login.trim());
  if (exists) return NextResponse.json({ ok: false, error: "логин уже занят" }, { status: 400 });

  const hash = await bcrypt.hash(body.password, 10);
  const r = await db.prepare(
    `INSERT INTO users (tenant_id, login, password_hash, role, name, email, bitrix_manager_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    u.tenantId,
    body.login.trim(),
    hash,
    role,
    body.name?.trim() || null,
    body.email?.trim() || null,
    body.bitrix_manager_id?.trim() || null
  );
  return NextResponse.json({ ok: true, id: r.lastInsertRowid });
}
