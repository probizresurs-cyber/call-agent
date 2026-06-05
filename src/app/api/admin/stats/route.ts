/**
 * CA Admin — статистика активности за последние 30 дней.
 *
 * GET → агрегированные данные по звонкам:
 *   - daily: массив { date, calls_count, active_tenants, analyzed }
 *   - totals: { total_calls_30d, total_tenants, total_analyzed, total_users }
 *
 * Защищён Bearer CA_ADMIN_TOKEN.
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

interface DailyRow {
  date: string;
  calls_count: string | number;
  active_tenants: string | number;
  analyzed: string | number;
}

interface TotalRow {
  total_calls_30d: string | number;
  total_tenants: string | number;
  total_analyzed: string | number;
}

interface UsersRow {
  total_users: string | number;
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const db = getDbAsync();

    const dailyRows = await db
      .prepare(
        `SELECT
           substr(c.started_at, 1, 10) AS date,
           COUNT(*) AS calls_count,
           COUNT(DISTINCT c.tenant_id) AS active_tenants,
           SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) AS analyzed
         FROM calls c
         WHERE c.started_at >= datetime('now', '-30 days')
         GROUP BY substr(c.started_at, 1, 10)
         ORDER BY date DESC`
      )
      .all<DailyRow>();

    const totalRow = await db
      .prepare(
        `SELECT
           COUNT(*) AS total_calls_30d,
           COUNT(DISTINCT tenant_id) AS total_tenants,
           SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS total_analyzed
         FROM calls
         WHERE started_at >= datetime('now', '-30 days')`
      )
      .get<TotalRow>();

    const usersRow = await db
      .prepare(`SELECT COUNT(*) AS total_users FROM users WHERE is_active = 1`)
      .get<UsersRow>();

    const daily = dailyRows.map((r) => ({
      date: r.date,
      calls_count: Number(r.calls_count ?? 0),
      active_tenants: Number(r.active_tenants ?? 0),
      analyzed: Number(r.analyzed ?? 0),
    }));

    return NextResponse.json({
      ok: true,
      daily,
      totals: {
        total_calls_30d: Number(totalRow?.total_calls_30d ?? 0),
        total_tenants: Number(totalRow?.total_tenants ?? 0),
        total_analyzed: Number(totalRow?.total_analyzed ?? 0),
        total_users: Number(usersRow?.total_users ?? 0),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
