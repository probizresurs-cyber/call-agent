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
import { getSessionUser, canManage } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

type Mode = "done" | "failed" | "all";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { mode?: Mode; onlyDone?: boolean };
  // Совместимость со старым API: onlyDone=true → mode="done"
  const mode: Mode = body.mode ?? (body.onlyDone === false ? "all" : "done");

  const db = getDbAsync();
  const tid = me.tenantId;
  let sql: string;
  // Все запросы скоупятся по tenant_id — массовый сброс не должен трогать чужие тенанты.
  if (mode === "failed") {
    // Все failed — даже без транскрипта (тогда воркер пройдёт через Whisper заново)
    sql = `UPDATE calls SET status='pending', attempts=0, error=NULL
           WHERE tenant_id = ? AND status='failed'`;
  } else if (mode === "done") {
    sql = `UPDATE calls SET status='pending', attempts=0, error=NULL
           WHERE tenant_id = ? AND status='done'
             AND id IN (SELECT call_id FROM transcripts WHERE text IS NOT NULL AND text != '')`;
  } else {
    // all = done+failed только с транскриптом (старое поведение «done+failed»)
    sql = `UPDATE calls SET status='pending', attempts=0, error=NULL
           WHERE tenant_id = ? AND status IN ('done','failed')
             AND id IN (SELECT call_id FROM transcripts WHERE text IS NOT NULL AND text != '')`;
  }

  const r = await db.prepare(sql).run(tid);
  const queued = await db
    .prepare("SELECT COUNT(*) AS n FROM calls WHERE tenant_id = ? AND status='pending'")
    .get<{ n: number }>(tid);
  if (!queued) throw new Error("queue count query failed");
  return NextResponse.json({
    ok: true,
    mode,
    reset: r.changes,
    pendingNow: queued.n,
  });
}
