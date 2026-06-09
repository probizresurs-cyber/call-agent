/**
 * Воркер:
 *  - каждые 5 сек берёт следующий pending звонок и обрабатывает
 *  - каждые 5 минут запускает автоимпорт новых звонков из Битрикса
 *  - каждые 30 минут авто-ретраит failed-звонки с retry-able ошибками (429/529/timeout/overloaded)
 * Запускается отдельным PM2-процессом.
 */
import path from "path";
import { loadEnv } from "../src/lib/loadEnv";
// Загружаем .env ДО любых импортов которые читают process.env
loadEnv(path.join(__dirname, ".."));

import { getDbAsync } from "../src/lib/db-compat";
import { processCall } from "../src/lib/pipeline";
import { runAutoImport, isAutoImportEnabled } from "../src/lib/auto-importer";
import { fetchEmailAndChats, getLastFetchedAt } from "../src/lib/bitrix-activities";
import { getDueSchedules, runScheduled } from "../src/lib/reports-scheduler";

// Сразу логируем доступность ключевых ENV — поможет диагностике
console.log("[worker] env check:",
  "BITRIX_WEBHOOK_URL=" + (process.env.BITRIX_WEBHOOK_URL ? "set" : "MISSING"),
  "OPENAI_API_KEY=" + (process.env.OPENAI_API_KEY ? "set" : "MISSING"),
  "ANTHROPIC_API_KEY=" + (process.env.ANTHROPIC_API_KEY ? "set" : "MISSING")
);

const POLL_INTERVAL_MS = 5_000;            // 5 сек — обработка очереди
const AUTO_IMPORT_INTERVAL_MS = 300_000;    // 5 минут — проверка новых звонков
const AUTO_RETRY_INTERVAL_MS = 1_800_000;    // 30 минут — переанализ failed
const ACTIVITIES_FETCH_INTERVAL_MS = 600_000; // 10 минут — забор email + Open Lines чатов
const SCHEDULER_INTERVAL_MS = 60_000;        // 1 минута — авто-отправка отчётов по расписанию
const MAX_ATTEMPTS = 3;                   // для pending/failed
const MAX_NO_RECORDING_ATTEMPTS = 6;      // для no_recording — попыток в течение 6 часов
const NO_RECORDING_RETRY_HOURS = 1;       // повтор раз в час
const STALE_MINUTES = 10;                 // звонок в processing-статусе дольше этого — считается застрявшим

// Паттерны "временных" ошибок Anthropic/OpenAI — failed-звонки с такими ошибками
// автоматически ставятся в очередь каждые 30 минут.
const RETRYABLE_ERROR_PATTERNS = [
  "overloaded_error",
  "rate_limit",
  "529",
  "429",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "fetch failed",
  "socket hang up",
  // OpenAI/Anthropic SDK так называют обрыв соединения (APIConnectionError →
  // "Connection error.") — классический транзиент, обязательно ретраим, иначе
  // звонок навсегда застревает в failed после 3 неудачных попыток.
  "Connection error",
  // Гео-блок OpenAI 403 — ВРЕМЕННЫЙ: CF-worker роутит запрос через случайный
  // edge-регион, иногда попадает в заблокированный. Повторная попытка часто
  // проходит из дружелюбного региона. Поэтому 403 тоже retry-able.
  "403",
  "Country, region",
  "territory not supported",
];

// ─────────────── Обработка очереди ───────────────
async function processQueueTick() {
  const db = getDbAsync();

  // Берём:
  //  - pending (без ограничений)
  //  - failed с попытками < MAX_ATTEMPTS
  //  - no_recording с попытками < MAX_NO_RECORDING_ATTEMPTS И последнее обновление больше часа назад
  //  - "stale" — застрявшие в processing-статусах больше STALE_MINUTES минут
  //    (это значит воркер крашнулся в их обработке; берём на повтор)
  // Интервалы захардкожены в SQL — datetime() с параметром не работает в PG-адаптере.
  // Если NO_RECORDING_RETRY_HOURS или STALE_MINUTES меняются — отредактировать здесь.
  const row = await db
    .prepare(
      `SELECT id, status FROM calls
       WHERE
         (status = 'pending')
         OR (status = 'failed' AND attempts < ?)
         OR (status = 'no_recording'
             AND attempts < ?
             AND datetime(updated_at) <= datetime('now', '-${NO_RECORDING_RETRY_HOURS} hour'))
         OR (status IN ('downloading','transcribing','analyzing','syncing')
             AND datetime(updated_at) <= datetime('now', '-${STALE_MINUTES} minute'))
       ORDER BY
         CASE status
           WHEN 'pending' THEN 0
           WHEN 'failed' THEN 1
           WHEN 'no_recording' THEN 3
           ELSE 2
         END,
         id ASC
       LIMIT 1`
    )
    .get<{ id: number; status: string }>(
      MAX_ATTEMPTS,
      MAX_NO_RECORDING_ATTEMPTS,
    );
  if (!row) return;

  const fromStatus =
    row.status === "no_recording" ? " (retry no_recording)"
    : ["downloading","transcribing","analyzing","syncing"].includes(row.status)
    ? ` (recovering stale ${row.status})`
    : "";
  console.log(`[worker] picking call #${row.id}${fromStatus}`);
  try {
    await processCall(row.id);
    console.log(`[worker] ✓ #${row.id} done`);
  } catch (e) {
    const err = e as Error;
    const msg = err.message;
    // Различаем три класса ошибок:
    //  - NoRecordingError — Bitrix не вернул файл (no_recording)
    //  - BudgetExceededError — §4.4 закончился лимит токенов/секунд на тенант (budget_exceeded)
    //  - всё остальное — failed
    if (err.name === "NoRecordingError") {
      console.warn(`[worker] ⊘ #${row.id} no recording:`, msg);
      await getDbAsync().prepare(
        `UPDATE calls SET status='no_recording', error=?, updated_at=datetime('now') WHERE id=?`
      ).run(msg, row.id);
    } else if (err.name === "BudgetExceededError") {
      console.warn(`[worker] 💰 #${row.id} budget exceeded:`, msg);
      await getDbAsync().prepare(
        `UPDATE calls SET status='budget_exceeded', error=?, updated_at=datetime('now') WHERE id=?`
      ).run(msg, row.id);
    } else {
      console.error(`[worker] ✗ #${row.id} failed:`, msg);
      await getDbAsync().prepare(
        `UPDATE calls SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`
      ).run(msg, row.id);
    }
  }
}

// ─────────────── Автоимпорт новых звонков ───────────────
async function autoImportTick() {
  if (!(await isAutoImportEnabled())) return;
  if (!process.env.BITRIX_WEBHOOK_URL?.trim()) return; // не настроено — скип
  try {
    const r = await runAutoImport();
    if (r.ok) {
      if (r.inserted > 0) {
        console.log(`[auto-import] +${r.inserted} new calls (fetched=${r.totalFetched}, skipped=${r.skipped})`);
      }
      // если 0 новых — молчим, чтобы не засорять лог каждые 5 минут
    } else if (r.error !== "disabled") {
      console.warn(`[auto-import] error: ${r.error}`);
    }
  } catch (e) {
    console.error("[auto-import] crash:", (e as Error).message);
  }
}

// ─────────────── Авто-ретрай failed с retry-able ошибками ───────────────
// Раз в 30 минут берём failed-звонки, у которых текст ошибки указывает на временную
// проблему провайдера (Anthropic overloaded/rate_limit, сетевые таймауты), и кидаем
// их обратно в pending. Так нам не надо вручную жать "Переанализировать → Только failed".
async function autoRetryFailedTick() {
  const db = getDbAsync();
  // Берём failed-звонки с attempts >= MAX_ATTEMPTS (которые сами уже не подберутся в очереди)
  // ИЛИ те, что лежат в failed > 10 минут — даём провайдеру время восстановиться.
  // Фильтр по error: LIKE '%pattern%' OR '%pattern2%' OR ...
  const likeConditions = RETRYABLE_ERROR_PATTERNS.map(() => `error LIKE ?`).join(" OR ");
  const likeParams = RETRYABLE_ERROR_PATTERNS.map((p) => `%${p}%`);

  const result = await db.prepare(
    `UPDATE calls
       SET status='pending', attempts=0, error=NULL, updated_at=datetime('now')
     WHERE status='failed'
       AND error IS NOT NULL
       AND (${likeConditions})
       AND datetime(updated_at) <= datetime('now', '-10 minutes')`
  ).run(...likeParams);

  if (result.changes && result.changes > 0) {
    console.log(`[auto-retry] reset ${result.changes} failed calls (retry-able errors)`);
  }
}

// ─────────────── Запуск трёх независимых циклов ───────────────
console.log("[worker] starting:",
  `queue interval=${POLL_INTERVAL_MS}ms,`,
  `auto-import interval=${AUTO_IMPORT_INTERVAL_MS}ms,`,
  `auto-retry interval=${AUTO_RETRY_INTERVAL_MS}ms`
);

(async function queueLoop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await processQueueTick(); } catch (e) { console.error("[queue] tick error:", e); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
})();

(async function autoImportLoop() {
  // первый запуск через 30 сек после старта (даём БД проинициализироваться)
  await new Promise((r) => setTimeout(r, 30_000));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await autoImportTick(); } catch (e) { console.error("[auto-import] tick error:", e); }
    await new Promise((r) => setTimeout(r, AUTO_IMPORT_INTERVAL_MS));
  }
})();

(async function autoRetryLoop() {
  // первый запуск через 2 минуты — даём очереди успеть пройтись
  await new Promise((r) => setTimeout(r, 120_000));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await autoRetryFailedTick(); } catch (e) { console.error("[auto-retry] tick error:", e); }
    await new Promise((r) => setTimeout(r, AUTO_RETRY_INTERVAL_MS));
  }
})();

// ─────────────── Забор email + Open Lines чатов каждые 10 минут ───────────────
(async function activitiesFetchLoop() {
  // Первый запуск через 1 минуту после старта
  await new Promise((r) => setTimeout(r, 60_000));
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (process.env.BITRIX_WEBHOOK_URL?.trim()) {
      try {
        const since = (await getLastFetchedAt()) || undefined;
        const r = await fetchEmailAndChats({ tenantId: 1, since, limit: 100 });
        if (r.inserted > 0) {
          console.log(`[activities-fetch] +${r.inserted} email/chats (total=${r.totalFetched}, skipped=${r.skipped}, errors=${r.errors})`);
        }
      } catch (e) {
        console.warn("[activities-fetch] tick error:", (e as Error).message);
      }
    }
    await new Promise((r) => setTimeout(r, ACTIVITIES_FETCH_INTERVAL_MS));
  }
})();

// ─────────────── Авто-отправка отчётов по расписанию ───────────────
// Раз в минуту берём расписания с next_run_at ≤ now (enabled=true) и шлём
// каждый в указанного получателя (личка bitrix-юзера или групповой "chatN").
// runScheduled() сам обновляет last_run_* и next_run_at для следующего тика.
(async function schedulerLoop() {
  // Первый запуск через 60 сек — даём БД и .env проинициализироваться.
  await new Promise((r) => setTimeout(r, 60_000));
  console.log(`[scheduler] starting (interval=${SCHEDULER_INTERVAL_MS}ms)`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const due = await getDueSchedules(new Date());
      for (const s of due) {
        console.log(`[scheduler] running #${s.id} "${s.name}" → ${s.recipient_kind}:${s.recipient_id}`);
        try {
          const r = await runScheduled(s);
          if (r.ok) {
            console.log(`[scheduler] ✓ #${s.id} sent (msg=${r.messageId ?? "-"})`);
          } else {
            console.warn(`[scheduler] ✗ #${s.id} failed: ${r.error}`);
          }
        } catch (e) {
          console.error(`[scheduler] crash #${s.id}:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error("[scheduler] tick error:", (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, SCHEDULER_INTERVAL_MS));
  }
})();
