/**
 * Воркер:
 *  - каждые 5 сек берёт следующий pending звонок и обрабатывает
 *  - каждые 5 минут запускает автоимпорт новых звонков из Битрикса
 * Запускается отдельным PM2-процессом.
 */
import path from "path";
import { loadEnv } from "../src/lib/loadEnv";
// Загружаем .env ДО любых импортов которые читают process.env
loadEnv(path.join(__dirname, ".."));

import { getDb } from "../src/lib/db";
import { processCall } from "../src/lib/pipeline";
import { runAutoImport, isAutoImportEnabled } from "../src/lib/auto-importer";

// Сразу логируем доступность ключевых ENV — поможет диагностике
console.log("[worker] env check:",
  "BITRIX_WEBHOOK_URL=" + (process.env.BITRIX_WEBHOOK_URL ? "set" : "MISSING"),
  "OPENAI_API_KEY=" + (process.env.OPENAI_API_KEY ? "set" : "MISSING"),
  "ANTHROPIC_API_KEY=" + (process.env.ANTHROPIC_API_KEY ? "set" : "MISSING")
);

const POLL_INTERVAL_MS = 5_000;        // 5 сек — обработка очереди
const AUTO_IMPORT_INTERVAL_MS = 300_000; // 5 минут — проверка новых звонков
const MAX_ATTEMPTS = 3;

// ─────────────── Обработка очереди ───────────────
async function processQueueTick() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM calls
       WHERE status IN ('pending','failed') AND attempts < ?
       ORDER BY id ASC LIMIT 1`
    )
    .get(MAX_ATTEMPTS) as { id: number } | undefined;
  if (!row) return;

  console.log(`[worker] picking call #${row.id}`);
  try {
    await processCall(row.id);
    console.log(`[worker] ✓ #${row.id} done`);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[worker] ✗ #${row.id} failed:`, msg);
    getDb().prepare(
      `UPDATE calls SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`
    ).run(msg, row.id);
  }
}

// ─────────────── Автоимпорт новых звонков ───────────────
async function autoImportTick() {
  if (!isAutoImportEnabled()) return;
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

// ─────────────── Запуск двух независимых циклов ───────────────
console.log("[worker] starting:",
  `queue interval=${POLL_INTERVAL_MS}ms,`,
  `auto-import interval=${AUTO_IMPORT_INTERVAL_MS}ms`
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
