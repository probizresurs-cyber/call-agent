import { getDb, getSetting, setSetting } from "./db";
import { importCallsFromBitrix, type ImportResult, type ImportError } from "./importer";

const LAST_IMPORT_KEY = "last_auto_import_at";
const LAST_RESULT_KEY = "last_auto_import_result";
const AUTO_ENABLED_KEY = "auto_import_enabled";

// Перекрываем последние N минут чтобы не пропустить звонки,
// которые попали в Bitrix с задержкой (вебхук от АТС может опаздывать).
const OVERLAP_MIN = 10;

// При самом первом запуске — за сколько дней назад начать
const INITIAL_LOOKBACK_DAYS = 1;

export function isAutoImportEnabled(): boolean {
  const v = getSetting(AUTO_ENABLED_KEY);
  // Если ещё не задано — по умолчанию ВКЛ
  return v == null || v === "true";
}

export function setAutoImportEnabled(enabled: boolean): void {
  setSetting(AUTO_ENABLED_KEY, enabled ? "true" : "false");
}

export function getLastAutoImport(): { at: string | null; result: string | null } {
  return {
    at: getSetting(LAST_IMPORT_KEY),
    result: getSetting(LAST_RESULT_KEY),
  };
}

/** Возвращает YYYY-MM-DD от current time с учётом MSK (или UTC если оффсет 0) */
function toDateStr(d: Date): string {
  // Используем UTC для совместимости с Bitrix DATE_CREATE
  return d.toISOString().slice(0, 10);
}

export async function runAutoImport(): Promise<ImportResult | ImportError | { ok: false; error: "disabled" }> {
  if (!isAutoImportEnabled()) {
    return { ok: false, error: "disabled" };
  }

  const lastAt = getSetting(LAST_IMPORT_KEY);
  let fromIso: string;

  if (lastAt) {
    // Возвращаемся на OVERLAP_MIN минут назад от последнего успешного запуска
    const lastDate = new Date(lastAt);
    lastDate.setMinutes(lastDate.getMinutes() - OVERLAP_MIN);
    fromIso = toDateStr(lastDate);
  } else {
    // Первый запуск — берём INITIAL_LOOKBACK_DAYS дней назад
    const d = new Date();
    d.setDate(d.getDate() - INITIAL_LOOKBACK_DAYS);
    fromIso = toDateStr(d);
  }

  const toIso = toDateStr(new Date());

  console.log(`[auto-import] running ${fromIso} .. ${toIso}`);
  const result = await importCallsFromBitrix({ fromDate: fromIso, toDate: toIso });

  // Сохраняем timestamp текущего запуска как last (даже если result.ok=false, но не disabled —
  // лучше двигать вперёд чем застрять навсегда)
  const now = new Date().toISOString();
  setSetting(LAST_IMPORT_KEY, now);

  // Краткое описание результата для UI
  const summary = result.ok
    ? `inserted=${result.inserted}, fetched=${result.totalFetched}, skipped=${result.skipped}`
    : `error: ${result.error}`;
  setSetting(LAST_RESULT_KEY, summary);

  return result;
}
