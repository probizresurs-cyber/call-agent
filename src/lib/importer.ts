/**
 * Импорт звонков из Битрикса в нашу БД.
 * Используется и в API route (/api/import/bitrix), и в auto-importer (воркер).
 */
import { getDb } from "./db";
import { voxListStatistics, entityTypeStringToId } from "./bitrix";
import { backfillManagerNames } from "./managers";

const MAX_PAGES = 20; // 20 страниц × 50 = до 1000 звонков за запуск

export interface ImportResult {
  ok: true;
  totalFetched: number;
  inserted: number;
  skipped: number;
  pages: number;
  durationMs: number;
  managers: { uniqueIds: number; fetched: number; updatedCalls: number } | null;
  note: string | null;
}

export interface ImportError {
  ok: false;
  error: string;
  partial?: { totalFetched: number; inserted: number; skipped: number; pages: number };
}

export interface ImportOpts {
  fromDate: string;       // YYYY-MM-DD
  toDate?: string;        // YYYY-MM-DD
  managerIds?: string[];
  maxPages?: number;      // override
  /**
   * Если true — импортируем все звонки, включая «служебные»
   * (без recording_url и без CRM_ACTIVITY_ID — обычно внутренние
   * между сотрудниками, IVR, конференц-режимы и т.п.).
   * Такие звонки сразу получают статус 'no_recording' — pipeline их не трогает.
   */
  includeServiceCalls?: boolean;
}

export async function importCallsFromBitrix(opts: ImportOpts): Promise<ImportResult | ImportError> {
  if (!process.env.BITRIX_WEBHOOK_URL?.trim()) {
    return { ok: false, error: "BITRIX_WEBHOOK_URL не задан в .env" };
  }

  const db = getDb();
  const t0 = Date.now();
  let start = 0;
  let totalFetched = 0;
  let inserted = 0;
  let skipped = 0;
  let pages = 0;
  const maxPages = opts.maxPages ?? MAX_PAGES;

  // Статус задаётся параметром — служебные звонки сразу no_recording
  const insertStmt = db.prepare(
    `INSERT INTO calls
      (bitrix_call_id, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id,
       bitrix_activity_id, manager_id, client_phone, direction,
       started_at, duration_sec, recording_url, status, attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bitrix_call_id) DO NOTHING`
  );

  try {
    while (pages < maxPages) {
      pages += 1;
      const page = await voxListStatistics({
        fromDate: opts.fromDate,
        toDate: opts.toDate,
        managerIds: opts.managerIds,
        // Не фильтруем по CALL_DURATION > 0 — иначе пропускаем все «не дозвонились»
        // (incoming calls с duration=0), а они важны для статистики менеджеров
        hasRecordOnly: false,
        start,
      });

      for (const stat of page.items) {
        totalFetched += 1;
        const recordingUrl = stat.CALL_RECORD_URL || stat.CALL_WEBDAV_URL || null;
        const hasActivity = stat.CRM_ACTIVITY_ID && stat.CRM_ACTIVITY_ID !== "0";
        const isServiceCall = !recordingUrl && !hasActivity;

        if (isServiceCall && !opts.includeServiceCalls) {
          skipped += 1; continue;
        }

        // Служебные сразу no_recording (не тратим попытки на их обработку)
        const initialStatus = isServiceCall ? "no_recording" : "pending";
        const initialAttempts = isServiceCall ? 99 : 0;  // 99 = не повторять

        const entityType = entityTypeStringToId(stat.CRM_ENTITY_TYPE);
        const r = insertStmt.run(
          stat.ID,
          entityType === 2 ? stat.CRM_ENTITY_ID ?? null : null,
          entityType === 1 ? stat.CRM_ENTITY_ID ?? null : null,
          entityType === 3 ? stat.CRM_ENTITY_ID ?? null : null,
          stat.CRM_ACTIVITY_ID ?? null,
          stat.PORTAL_USER_ID ?? null,
          stat.PHONE_NUMBER ?? null,
          // CALL_TYPE по docs Bitrix: "1"=исходящий, "2"=входящий, "3"=входящий с переадресацией, "4"=callback
          (stat.CALL_TYPE === "2" || stat.CALL_TYPE === "3") ? "in" : "out",
          stat.CALL_START_DATE ?? null,
          Number(stat.CALL_DURATION || 0),
          recordingUrl,
          initialStatus,
          initialAttempts
        );
        if (r.changes > 0) inserted += 1; else skipped += 1;
      }

      if (page.next == null) break;
      start = page.next;
    }
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message,
      partial: { totalFetched, inserted, skipped, pages },
    };
  }

  // Подтягиваем имена менеджеров для новых звонков
  let managers: { uniqueIds: number; fetched: number; updatedCalls: number } | null = null;
  try {
    managers = await backfillManagerNames();
  } catch (e) {
    console.warn("[importer] backfillManagerNames failed:", (e as Error).message);
  }

  return {
    ok: true,
    totalFetched, inserted, skipped, pages,
    durationMs: Date.now() - t0,
    managers,
    note: pages >= maxPages
      ? `Достигнут лимит ${maxPages * 50} звонков за запуск.`
      : null,
  };
}
