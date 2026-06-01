import { getDb, getSetting, setSetting } from "./db";
import { importCallsFromBitrix, type ImportResult, type ImportError } from "./importer";

const LAST_IMPORT_KEY = "last_auto_import_at";
const LAST_RESULT_KEY = "last_auto_import_result";
const AUTO_ENABLED_KEY = "auto_import_enabled";

// Перекрываем последние N минут чтобы не пропустить звонки,
// которые попали в Bitrix с задержкой (вебхук от АТС может опаздывать).
const OVERLAP_MIN = 10;

// При самом первом запуске — за сколько дней назад начать
const INITIAL_LOOKBACK_DAYS = 7;

// При ручном "Запустить сейчас" — игнорируем last_import_at и берём 1 день
const MANUAL_LOOKBACK_DAYS = 1;

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

export interface RunAutoImportOpts {
  /** Принудительный режим: игнорировать last_import_at и взять последние N дней */
  manual?: boolean;
  /** Если manual=true, можно переопределить число дней (по умолчанию 1) */
  lookbackDays?: number;
}

export async function runAutoImport(opts: RunAutoImportOpts = {}): Promise<ImportResult | ImportError | { ok: false; error: "disabled" }> {
  if (!opts.manual && !isAutoImportEnabled()) {
    return { ok: false, error: "disabled" };
  }

  const lastAt = getSetting(LAST_IMPORT_KEY);
  let fromIso: string;

  if (opts.manual) {
    // Ручной запуск — всегда фиксированный lookback, игнорируем last_at
    const d = new Date();
    d.setDate(d.getDate() - (opts.lookbackDays ?? MANUAL_LOOKBACK_DAYS));
    fromIso = toDateStr(d);
  } else if (lastAt) {
    // Регулярный цикл — от last_import - OVERLAP минут
    const lastDate = new Date(lastAt);
    lastDate.setMinutes(lastDate.getMinutes() - OVERLAP_MIN);
    fromIso = toDateStr(lastDate);
  } else {
    // Самый первый запуск воркера — INITIAL_LOOKBACK_DAYS дней назад
    const d = new Date();
    d.setDate(d.getDate() - INITIAL_LOOKBACK_DAYS);
    fromIso = toDateStr(d);
  }

  const toIso = toDateStr(new Date());

  console.log(`[auto-import] running ${fromIso} .. ${toIso}${opts.manual ? " (manual)" : ""}`);
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
