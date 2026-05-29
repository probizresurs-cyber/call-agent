/**
 * Простой воркер: каждые 5 сек берёт следующий pending звонок и обрабатывает.
 * Запускать отдельным PM2-процессом.
 */
import path from "path";
import { loadEnv } from "../src/lib/loadEnv";
// Загружаем .env ДО любых импортов которые читают process.env
loadEnv(path.join(__dirname, ".."));

import { getDb } from "../src/lib/db";
import { processCall } from "../src/lib/pipeline";

// Сразу логируем доступность ключевых ENV — поможет диагностике
console.log("[worker] env check:",
  "BITRIX_WEBHOOK_URL=" + (process.env.BITRIX_WEBHOOK_URL ? "set" : "MISSING"),
  "OPENAI_API_KEY=" + (process.env.OPENAI_API_KEY ? "set" : "MISSING"),
  "ANTHROPIC_API_KEY=" + (process.env.ANTHROPIC_API_KEY ? "set" : "MISSING")
);

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;

async function tick() {
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
    db.prepare(
      `UPDATE calls SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`
    ).run(msg, row.id);
  }
}

console.log("[worker] starting, poll interval =", POLL_INTERVAL_MS, "ms");
(async function loop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error("[worker] tick error:", e);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
})();
