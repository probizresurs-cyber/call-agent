/**
 * Cross-product admin endpoint — список тенантов Call-Agent для админ-панели
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

interface TenantRow {
  id: number;
  name: string;
  created_at: string | Date;
  analysis_model: string | null;
  users_count: number | string;
  calls_count: number | string;
  analyzed_count: number | string;
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const db = getDbAsync();
    const rows = await db
      .prepare(
        `SELECT t.id, t.name, t.created_at, t.analysis_model,
                COUNT(DISTINCT u.id) as users_count,
                COUNT(DISTINCT c.id) as calls_count,
                SUM(CASE WHEN c.status='done' THEN 1 ELSE 0 END) as analyzed_count
         FROM tenants t
         LEFT JOIN users u ON u.tenant_id = t.id
         LEFT JOIN calls c ON c.tenant_id = t.id
         GROUP BY t.id, t.name, t.created_at, t.analysis_model
         ORDER BY t.created_at DESC`
      )
      .all<TenantRow>();

    const tenants = rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      analysisModel: r.analysis_model ?? null,
      usersCount: Number(r.users_count ?? 0),
      callsCount: Number(r.calls_count ?? 0),
      analyzedCount: Number(r.analyzed_count ?? 0),
    }));

    return NextResponse.json({ ok: true, tenants, total: tenants.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
