/**
 * Cross-product admin endpoint — список пользователей Call-Agent для админ-панели
 * MarketRadar.
 *
 * Защищён shared-secret-токеном через заголовок `Authorization: Bearer ${CA_ADMIN_TOKEN}`.
 * Токен задаётся в .env переменной CA_ADMIN_TOKEN — должен совпадать с тем,
 * что прописан в .env MarketRadar.
 *
 * Этот эндпоинт НЕ использует сессионную авторизацию Call-Agent —
 * он предназначен исключительно для server-to-server вызовов из MR.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.CA_ADMIN_TOKEN;
  if (!expected || expected.length < 16) {
    return { ok: false, status: 500, error: "CA_ADMIN_TOKEN is not configured on server" };
  }
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, error: "Missing Bearer token" };
  if (m[1].trim() !== expected) return { ok: false, status: 403, error: "Invalid token" };
  return { ok: true };
}

interface UserRow {
  id: number;
  login: string;
  role: string;
  name: string | null;
  email: string | null;
  is_active: boolean | number;
  bitrix_manager_id: string | null;
  tenant_id: number;
  tenant_name: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const db = getDbAsync();
    const rows = await db
      .prepare(
        `SELECT
           u.id, u.login, u.role, u.name, u.email, u.is_active,
           u.bitrix_manager_id, u.tenant_id,
           t.name AS tenant_name,
           u.created_at, u.updated_at
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         ORDER BY u.created_at DESC, u.id DESC`
      )
      .all<UserRow>();

    const items = rows.map((r) => ({
      id: r.id,
      login: r.login,
      role: r.role,
      name: r.name,
      email: r.email,
      isActive: !!r.is_active,
      bitrixManagerId: r.bitrix_manager_id,
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ""),
    }));

    return NextResponse.json({ ok: true, items, total: items.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
