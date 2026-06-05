/**
 * Детальные данные одного пользователя Call-Agent для админ-панели MarketRadar.
 *
 * GET /api/admin/users/:id
 * Возвращает: { ok: true, user: {...}, stats: {...} | null, recentCalls: [...] }
 *
 * Защита: Bearer CA_ADMIN_TOKEN (server-to-server из MR).
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
  created_at: string | Date;
  tenant_name: string | null;
}

interface StatsRow {
  total_calls: number | null;
  analyzed: number | null;
  failed: number | null;
  no_recording: number | null;
  avg_score: number | null;
  avg_compliance_pct: number | null;
  last_call_at: string | Date | null;
  total_duration_sec: number | null;
}

interface CallRow {
  id: number | string;
  started_at: string | Date | null;
  duration_sec: number | null;
  status: string | null;
  direction: string | null;
  manager_score: number | null;
  summary: string | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  try {
    const db = getDbAsync();

    // 1. Основные данные пользователя
    const userRows = await db
      .prepare(
        `SELECT u.id, u.login, u.role, u.name, u.email, u.is_active,
                u.bitrix_manager_id, u.tenant_id, u.created_at,
                t.name AS tenant_name
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = $1`
      )
      .all<UserRow>(userId);

    const u = userRows[0];
    if (!u) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    const user = {
      id: u.id,
      login: u.login,
      role: u.role,
      name: u.name,
      email: u.email,
      isActive: !!u.is_active,
      bitrixManagerId: u.bitrix_manager_id,
      tenantId: u.tenant_id,
      tenantName: u.tenant_name,
      createdAt: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at ?? ""),
    };

    // 2 & 3. Статистика и последние звонки — только если есть bitrix_manager_id
    let stats: Record<string, unknown> | null = null;
    let recentCalls: Record<string, unknown>[] = [];

    if (u.bitrix_manager_id) {
      const managerId = u.bitrix_manager_id;
      const tenantId = u.tenant_id;

      // 2. Агрегированная статистика
      const statsRows = await db
        .prepare(
          `SELECT
             COUNT(*) AS total_calls,
             SUM(CASE WHEN c.status = 'done'         THEN 1 ELSE 0 END) AS analyzed,
             SUM(CASE WHEN c.status = 'failed'        THEN 1 ELSE 0 END) AS failed,
             SUM(CASE WHEN c.status = 'no_recording' THEN 1 ELSE 0 END) AS no_recording,
             ROUND(AVG(a.manager_score)::numeric, 1)              AS avg_score,
             ROUND((AVG(a.script_compliance) * 100)::numeric, 0) AS avg_compliance_pct,
             MAX(c.started_at)                                    AS last_call_at,
             SUM(c.duration_sec)                                  AS total_duration_sec
           FROM calls c
           LEFT JOIN analyses a ON a.call_id = c.id
           WHERE c.tenant_id = $1 AND c.manager_id = $2`
        )
        .all<StatsRow>(tenantId, managerId);

      const sr = statsRows[0];
      if (sr && (Number(sr.total_calls) ?? 0) > 0) {
        stats = {
          totalCalls: Number(sr.total_calls ?? 0),
          analyzed: Number(sr.analyzed ?? 0),
          failed: Number(sr.failed ?? 0),
          noRecording: Number(sr.no_recording ?? 0),
          avgScore: sr.avg_score != null ? Number(sr.avg_score) : null,
          avgCompliancePct: sr.avg_compliance_pct != null ? Number(sr.avg_compliance_pct) : null,
          lastCallAt: sr.last_call_at
            ? sr.last_call_at instanceof Date
              ? sr.last_call_at.toISOString()
              : String(sr.last_call_at)
            : null,
          totalDurationSec: Number(sr.total_duration_sec ?? 0),
        };
      }

      // 3. Последние 5 звонков
      const callRows = await db
        .prepare(
          `SELECT c.id, c.started_at, c.duration_sec, c.status, c.direction,
                  a.manager_score, a.summary
           FROM calls c
           LEFT JOIN analyses a ON a.call_id = c.id
           WHERE c.tenant_id = $1 AND c.manager_id = $2
           ORDER BY c.started_at DESC
           LIMIT 5`
        )
        .all<CallRow>(tenantId, managerId);

      recentCalls = callRows.map((c) => ({
        id: c.id,
        startedAt: c.started_at
          ? c.started_at instanceof Date
            ? c.started_at.toISOString()
            : String(c.started_at)
          : null,
        durationSec: c.duration_sec != null ? Number(c.duration_sec) : null,
        status: c.status,
        direction: c.direction,
        managerScore: c.manager_score != null ? Number(c.manager_score) : null,
        summary: c.summary,
      }));
    }

    return NextResponse.json({ ok: true, user, stats, recentCalls });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
