import { NextResponse } from "next/server";
import { getDbAsync } from "@/lib/db-compat";
import { guard } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const g = await guard(); if (g) return g;
  const db = getDbAsync();

  const totals = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status IN ('pending','downloading','transcribing','analyzing','syncing') THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM calls`
    )
    .get();

  const sentiments = await db
    .prepare(`SELECT sentiment, COUNT(*) AS n FROM analyses GROUP BY sentiment`)
    .all();

  const avgScore = await db
    .prepare(`SELECT AVG(manager_score) AS avg FROM analyses`)
    .get<{ avg: number | null }>();

  const topManagers = await db
    .prepare(
      `SELECT c.manager_id, c.manager_name,
              COUNT(*) AS calls,
              AVG(a.manager_score) AS avg_score
       FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.manager_id IS NOT NULL
       GROUP BY c.manager_id
       ORDER BY calls DESC LIMIT 10`
    )
    .all();

  return NextResponse.json({
    ok: true,
    totals,
    sentiments,
    avgManagerScore: avgScore?.avg ?? null,
    topManagers,
  });
}
