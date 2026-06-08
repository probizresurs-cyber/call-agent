import { getSetting, setSetting } from "./db";
import { importCallsFromBitrix, type ImportResult, type ImportError } from "./importer";

const LAST_IMPORT_KEY = "last_auto_import_at";
const LAST_RESULT_KEY = "last_auto_import_result";
const AUTO_ENABLED_KEY = "auto_import_enabled";

// Перекрываем последние N минут чтобы не пропустить звонки,
// которые попали в Bitrix с задержкой (вебхук от АТС может опаздывать).
const OVERLAP_MIN = 30; // было 10 — Bitrix может опаздывать дольше

// При самом первом запуске — за сколько дней назад начать
const INITIAL_LOOKBACK_DAYS = 7;

// При ручном "Запустить сейчас" — игнорируем last_import_at и берём 1 день
const MANUAL_LOOKBACK_DAYS = 1;

export async function isAutoImportEnabled(): Promise<boolean> {
  const v = await getSetting(AUTO_ENABLED_KEY);
  // Если ещё не задано — по умолчанию ВКЛ
  return v == null || v === "true";
}

export async function setAutoImportEnabled(enabled: boolean): Promise<void> {
  await setSetting(AUTO_ENABLED_KEY, enabled ? "true" : "false");
}

export async function getLastAutoImport(): Promise<{ at: string | null; result: string | null }> {
  const [at, result] = await Promise.all([
    getSetting(LAST_IMPORT_KEY),
    getSetting(LAST_RESULT_KEY),
  ]);
  return { at, result };
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
  if (!opts.manual && !(await isAutoImportEnabled())) {
    return { ok: false, error: "disabled" };
  }

  const lastAt = await getSetting(LAST_IMPORT_KEY);
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

  // ВАЖНО: строго `>`, не `>=`. toDateStr обрезает до YYYY-MM-DD (без времени),
  // поэтому при импорте за СЕГОДНЯ from и to равны (оба = текущая дата) — это
  // ВАЛИДНЫЙ импорт за день, пропускать нельзя. `>=` ломал импорт за текущий
  // день целиком (звонки не подтягивались пока день не сменится).
  if (fromIso > toIso) {
    console.log('[auto-import] fromDate > toDate, skipping');
    return { ok: true, skipped: true } as unknown as ImportResult;
  }

  console.log(`[auto-import] running ${fromIso} .. ${toIso}${opts.manual ? " (manual)" : ""}`);
  // Тянем включая служебные — иначе общая статистика не сходится с Битриксом
  const result = await importCallsFromBitrix({
    fromDate: fromIso,
    toDate: toIso,
    includeServiceCalls: true,
  });

  const now = new Date().toISOString();

  if (result.ok) {
    await setSetting(LAST_IMPORT_KEY, now);

    // Предупреждение о достижении лимита страниц
    if (result.note) {
      console.warn('[auto-import] MAX_PAGES reached! Some calls may be missing. Consider running manual backfill.');
    }
  } else {
    console.warn('[auto-import] import failed, not updating last_import_at to preserve gap for retry');
    // НЕ обновляем — следующий запуск попытается снова с того же fromDate
  }

  // Краткое описание результата для UI
  const summary = result.ok
    ? `inserted=${result.inserted}, fetched=${result.totalFetched}, skipped=${result.skipped}`
    : `error: ${result.error}`;
  await setSetting(LAST_RESULT_KEY, summary);

  return result;
}
