/**
 * PATCH — обновить пользователя (включая смену пароля, роли, привязки)
 * DELETE — удалить (мягко, через is_active=0)
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser, canManage, type UserRole } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const ROLES: UserRole[] = ["owner", "admin", "head", "manager"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });

  const db = getDb();
  const target = db.prepare(`SELECT id, tenant_id, role FROM users WHERE id = ?`).get(id) as
    { id: number; tenant_id: number; role: UserRole } | undefined;
  if (!target || target.tenant_id !== me.tenantId) {
    return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    password?: string; role?: UserRole; name?: string; email?: string;
    bitrix_manager_id?: string | null; is_active?: boolean;
  };

  const fields: string[] = [];
  const params: unknown[] = [];

  if (body.password) {
    if (body.password.length < 6) {
      return NextResponse.json({ ok: false, error: "пароль минимум 6 символов" }, { status: 400 });
    }
    fields.push("password_hash = ?");
    params.push(await bcrypt.hash(body.password, 10));
  }
  if (body.role !== undefined && ROLES.includes(body.role)) {
    // Защита: только owner может менять роли на owner или менять роль другого owner
    if ((body.role === "owner" || target.role === "owner") && me.role !== "owner") {
      return NextResponse.json({ ok: false, error: "только owner управляет owner-ролями" }, { status: 403 });
    }
    fields.push("role = ?");
    params.push(body.role);
  }
  if (body.name !== undefined) { fields.push("name = ?"); params.push(body.name?.trim() || null); }
  if (body.email !== undefined) { fields.push("email = ?"); params.push(body.email?.trim() || null); }
  if (body.bitrix_manager_id !== undefined) {
    fields.push("bitrix_manager_id = ?");
    params.push(body.bitrix_manager_id?.trim() || null);
  }
  if (body.is_active !== undefined) { fields.push("is_active = ?"); params.push(body.is_active ? 1 : 0); }
  if (fields.length === 0) return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });

  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id) || id === me.id) {
    return NextResponse.json({ ok: false, error: "нельзя удалить самого себя" }, { status: 400 });
  }
  const db = getDb();
  const target = db.prepare(`SELECT tenant_id, role FROM users WHERE id = ?`).get(id) as
    { tenant_id: number; role: UserRole } | undefined;
  if (!target || target.tenant_id !== me.tenantId) {
    return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
  }
  if (target.role === "owner" && me.role !== "owner") {
    return NextResponse.json({ ok: false, error: "только owner может удалить owner" }, { status: 403 });
  }
  // Удаляем сессии + помечаем неактивным (мягкое удаление чтобы не разорвать историю)
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(id);
  db.prepare(`UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
