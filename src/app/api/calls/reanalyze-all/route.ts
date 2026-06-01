/**
 * POST /api/calls/reanalyze-all
 * Сбрасывает status='done' и 'failed' звонков с уже скачанным транскриптом
 * в 'pending'. Воркер переанализирует их через Claude (Whisper пропустит,
 * т.к. транскрипт уже есть).
 *
 * Body: { onlyDone?: boolean } — если true, только done (не трогаем failed)
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;

  const body = (await req.json().catch(() => ({}))) as { onlyDone?: boolean };
  const db = getDb();

  // Берём только те где есть транскрипт — иначе будет повторный Whisper-вызов
  const statuses = body.onlyDone ? "'done'" : "'done','failed'";
  const r = db.prepare(
    `UPDATE calls SET status='pending', attempts=0, error=NULL
     WHERE status IN (${statuses})
       AND id IN (SELECT call_id FROM transcripts WHERE text IS NOT NULL AND text != '')`
  ).run();

  const queued = db.prepare("SELECT COUNT(*) AS n FROM calls WHERE status='pending'").get() as { n: number };
  return NextResponse.json({
    ok: true,
    reset: r.changes,
    pendingNow: queued.n,
  });
}
