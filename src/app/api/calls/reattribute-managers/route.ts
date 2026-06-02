/**
 * POST /api/calls/reattribute-managers
 * Body: { fromDate: "YYYY-MM-DD", toDate?: "YYYY-MM-DD" }
 *
 * Пересчитывает manager_id для уже импортированных звонков:
 *  - Если есть CRM_ACTIVITY_ID → берём RESPONSIBLE_ID активности из Битрикса
 *  - Иначе оставляем как есть (PORTAL_USER_ID из voximplant)
 *
 * Возвращает: { ok, processed, updated, unchanged }
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { crmCallActivitiesByPeriod } from "@/lib/bitrix";
import { backfillManagerNames } from "@/lib/managers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;

  const body = (await req.json().catch(() => ({}))) as { fromDate?: string; toDate?: string };
  if (!body.fromDate) {
    return NextResponse.json({ ok: false, error: "fromDate required (YYYY-MM-DD)" }, { status: 400 });
  }

  const db = getDbAsync();
  const t0 = Date.now();

  // 1. Грузим активности с RESPONSIBLE_ID за период
  const activityResponsible = await crmCallActivitiesByPeriod({
    fromDate: body.fromDate,
    toDate: body.toDate,
  });

  // 2. Берём все звонки с активностью за период
  const calls = await db.prepare(
    `SELECT id, bitrix_activity_id, manager_id
     FROM calls
     WHERE substr(started_at, 1, 10) >= ?
       AND substr(started_at, 1, 10) <= ?
       AND bitrix_activity_id IS NOT NULL
       AND bitrix_activity_id != '0'`
  ).all<{ id: number; bitrix_activity_id: string; manager_id: string | null }>(body.fromDate, body.toDate || body.fromDate);

  // 3. Для каждого — если RESPONSIBLE отличается, обновляем
  const updateStmt = db.prepare(`UPDATE calls SET manager_id = ?, manager_name = NULL WHERE id = ?`);
  let updated = 0;
  let unchanged = 0;
  for (const c of calls) {
    const newMgr = activityResponsible.get(c.bitrix_activity_id);
    if (newMgr && newMgr !== c.manager_id) {
      await updateStmt.run(newMgr, c.id);
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  // 4. Подтягиваем имена обновлённых менеджеров
  let managers = null;
  try {
    managers = await backfillManagerNames();
  } catch (e) {
    console.warn("[reattribute] backfillManagerNames failed:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    processed: calls.length,
    updated,
    unchanged,
    activitiesFound: activityResponsible.size,
    managers,
    durationMs: Date.now() - t0,
  });
}
