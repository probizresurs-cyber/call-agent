import { NextResponse } from "next/server";
import { getDbAsync } from "@/lib/db-compat";
import { getSessionUser } from "@/lib/auth";
import { rlsFor } from "@/lib/rls";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = getDbAsync();

  // Tenant + (для manager) manager-скоуп. analyses не имеет tenant_id —
  // скоупим через EXISTS/JOIN по calls.
  const rls = rlsFor(me, { table: "c" });

  const totals = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status IN ('pending','downloading','transcribing','analyzing','syncing') THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM calls c
       WHERE ${rls.sql}`
    )
    .get(...rls.params);

  const sentiments = await db
    .prepare(
      `SELECT a.sentiment, COUNT(*) AS n
       FROM analyses a
       JOIN calls c ON c.id = a.call_id
       WHERE ${rls.sql}
       GROUP BY a.sentiment`
    )
    .all(...rls.params);

  const avgScore = await db
    .prepare(
      `SELECT AVG(a.manager_score) AS avg
       FROM analyses a
       JOIN calls c ON c.id = a.call_id
       WHERE ${rls.sql}`
    )
    .get<{ avg: number | null }>(...rls.params);

  const topManagers = await db
    .prepare(
      `SELECT c.manager_id, MAX(c.manager_name) AS manager_name,
              COUNT(*) AS calls,
              AVG(a.manager_score) AS avg_score
       FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
       WHERE ${rls.sql} AND c.manager_id IS NOT NULL
       GROUP BY c.manager_id
       ORDER BY calls DESC LIMIT 10`
    )
    .all(...rls.params);

  return NextResponse.json({
    ok: true,
    totals,
    sentiments,
    avgManagerScore: avgScore?.avg ?? null,
    topManagers,
  });
}
