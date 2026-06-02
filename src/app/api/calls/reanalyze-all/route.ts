/**
 * POST /api/calls/reanalyze-all
 * Сбрасывает звонки в 'pending' для повторной обработки.
 *
 * Body: { mode: "done" | "failed" | "all" }
 *   - "done"   — только успешно обработанные с транскриптом (Whisper не запустится)
 *   - "failed" — только упавшие (включая без транскрипта — могут пойти заново через Whisper)
 *   - "all"    — done + failed с транскриптом (legacy)
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

type Mode = "done" | "failed" | "all";

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;

  const body = (await req.json().catch(() => ({}))) as { mode?: Mode; onlyDone?: boolean };
  // Совместимость со старым API: onlyDone=true → mode="done"
  const mode: Mode = body.mode ?? (body.onlyDone === false ? "all" : "done");

  const db = getDbAsync();
  let sql: string;
  if (mode === "failed") {
    // Все failed — даже без транскрипта (тогда воркер пройдёт через Whisper заново)
    sql = `UPDATE calls SET status='pending', attempts=0, error=NULL
           WHERE status='failed'`;
  } else if (mode === "done") {
    sql = `UPDATE calls SET status='pending', attempts=0, error=NULL
           WHERE status='done'
             AND id IN (SELECT call_id FROM transcripts WHERE text IS NOT NULL AND text != '')`;
  } else {
    // all = done+failed только с транскриптом (старое поведение «done+failed»)
    sql = `UPDATE calls SET status='pending', attempts=0, error=NULL
           WHERE status IN ('done','failed')
             AND id IN (SELECT call_id FROM transcripts WHERE text IS NOT NULL AND text != '')`;
  }

  const r = await db.prepare(sql).run();
  const queued = await db.prepare("SELECT COUNT(*) AS n FROM calls WHERE status='pending'").get<{ n: number }>();
  if (!queued) throw new Error("queue count query failed");
  return NextResponse.json({
    ok: true,
    mode,
    reset: r.changes,
    pendingNow: queued.n,
  });
}
