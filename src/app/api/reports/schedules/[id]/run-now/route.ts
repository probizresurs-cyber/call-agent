/**
 * POST /api/reports/schedules/:id/run-now — ручной запуск расписания.
 *
 * Используется для тестирования из UI: «прогнать сейчас». runScheduled() сам
 * пишет last_run_* и пересчитывает next_run_at, как при штатном запуске воркером.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getSchedule, runScheduled } from "@/lib/reports-scheduler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!canViewTeam(me.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
    }

    const schedule = await getSchedule(id, me.tenantId);
    if (!schedule) {
      return NextResponse.json({ ok: false, error: "Не найдено" }, { status: 404 });
    }

    const r = await runScheduled(schedule);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/schedules/:id/run-now] failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
