/**
 * Импорт исторических звонков из Битрикс24 в нашу БД.
 * После INSERT воркер сам подхватит звонки в `pending` и обработает.
 *
 * POST /api/import/bitrix
 * Body: { fromDate: "YYYY-MM-DD", toDate?: "YYYY-MM-DD", managerIds?: string[] }
 *
 * Возвращает: { ok, total, inserted, skipped, durationMs }
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { voxListStatistics, entityTypeStringToId } from "@/lib/bitrix";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PAGES = 20; // 20 страниц × 50 = до 1000 звонков за импорт

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;

  const body = (await req.json().catch(() => ({}))) as {
    fromDate?: string;
    toDate?: string;
    managerIds?: string[];
  };

  if (!body.fromDate) {
    return NextResponse.json(
      { ok: false, error: "fromDate обязателен (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (!process.env.BITRIX_WEBHOOK_URL?.trim()) {
    return NextResponse.json(
      { ok: false, error: "BITRIX_WEBHOOK_URL не задан в .env" },
      { status: 400 }
    );
  }

  const db = getDb();
  const t0 = Date.now();
  let start = 0;
  let totalFetched = 0;
  let inserted = 0;
  let skipped = 0;
  let pages = 0;

  const insertStmt = db.prepare(
    `INSERT INTO calls
      (bitrix_call_id, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id,
       bitrix_activity_id, manager_id, client_phone, direction,
       started_at, duration_sec, recording_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(bitrix_call_id) DO NOTHING`
  );

  try {
    while (pages < MAX_PAGES) {
      pages += 1;
      const page = await voxListStatistics({
        fromDate: body.fromDate,
        toDate: body.toDate,
        managerIds: body.managerIds,
        hasRecordOnly: true,
        start,
      });

      for (const stat of page.items) {
        totalFetched += 1;
        // Если recording_url пусто, но есть CRM_ACTIVITY_ID — всё равно вставляем.
        // Pipeline сам резолвит ссылку через crm.activity.get перед скачиванием
        // (актуально для Телфин/Mango/UIS — записи лежат в FILES активности).
        const recordingUrl = stat.CALL_RECORD_URL || stat.CALL_WEBDAV_URL || null;
        if (!recordingUrl && !stat.CRM_ACTIVITY_ID) { skipped += 1; continue; }

        const entityType = entityTypeStringToId(stat.CRM_ENTITY_TYPE);
        const r = insertStmt.run(
          stat.ID,                                                       // bitrix_call_id
          entityType === 2 ? stat.CRM_ENTITY_ID ?? null : null,          // deal
          entityType === 1 ? stat.CRM_ENTITY_ID ?? null : null,          // lead
          entityType === 3 ? stat.CRM_ENTITY_ID ?? null : null,          // contact
          stat.CRM_ACTIVITY_ID ?? null,
          stat.PORTAL_USER_ID ?? null,
          stat.PHONE_NUMBER ?? null,
          stat.CALL_TYPE === "1" ? "in" : "out",
          stat.CALL_START_DATE ?? null,
          Number(stat.CALL_DURATION || 0),
          recordingUrl
        );
        if (r.changes > 0) inserted += 1; else skipped += 1;
      }

      if (page.next == null) break;
      start = page.next;
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, partial: { totalFetched, inserted, skipped, pages } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    totalFetched,
    inserted,
    skipped,
    pages,
    durationMs: Date.now() - t0,
    note: pages >= MAX_PAGES
      ? `Достигнут лимит ${MAX_PAGES * 50} звонков за импорт. Запустите ещё раз с более узким периодом если нужно больше.`
      : null,
  });
}
