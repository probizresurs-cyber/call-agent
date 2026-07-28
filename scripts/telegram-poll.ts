/**
 * Отдельный PM2-процесс: long-polling Telegram-бота отчётов Call-Agent.
 *
 * Почему polling, а не webhook: серверы Telegram не могут достучаться до этого
 * VPS входящим соединением (гео-блок, тот же класс проблемы, что у OpenAI/
 * Anthropic — только в обратную сторону). Поэтому вместо «Telegram стучится
 * к нам» сервер сам периодически спрашивает «есть новые сообщения?» через
 * getUpdates — это исходящий запрос, идёт через прокси CA_TELEGRAM_BASE_URL
 * (Cloudflare Worker) и работает надёжно.
 *
 * Если CA_TELEGRAM_BOT_TOKEN не задан — процесс тихо простаивает (не падает,
 * не спамит рестартами PM2), чтобы бот можно было включить позже без
 * дополнительных изменений инфраструктуры.
 */
import path from "path";
import { loadEnv } from "../src/lib/loadEnv";
// Загружаем .env ДО любых импортов которые читают process.env
loadEnv(path.join(__dirname, ".."));

import { telegramConfigured, tgDeleteWebhook, tgGetUpdates } from "../src/lib/telegram";
import { handleTelegramUpdate } from "../src/lib/telegram-bot-logic";

const IDLE_CHECK_MS = 60_000;   // если токен не задан — проверяем раз в минуту
const POLL_TIMEOUT_SEC = 25;    // long-poll: ждём новые апдейты до 25 сек
const ERROR_BACKOFF_MS = 5_000; // пауза после сбоя перед повтором

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("[telegram-poll] старт; token=" + (telegramConfigured() ? "set" : "MISSING"));

  // Токен не задан — простаиваем без ошибок, ждём, пока его добавят в .env.
  while (!telegramConfigured()) {
    await sleep(IDLE_CHECK_MS);
  }

  // Снимаем webhook (если был зарегистрирован) — getUpdates несовместим с активным webhook.
  const del = await tgDeleteWebhook();
  console.log("[telegram-poll] deleteWebhook:", del.ok ? "ok" : `error: ${del.error}`);

  let offset = 0;
  for (;;) {
    try {
      const res = await tgGetUpdates(offset, POLL_TIMEOUT_SEC);
      if (!res.ok) {
        console.warn("[telegram-poll] getUpdates failed:", res.error);
        await sleep(ERROR_BACKOFF_MS);
        continue;
      }
      for (const update of res.updates) {
        offset = Math.max(offset, update.update_id + 1);
        try {
          await handleTelegramUpdate(update);
        } catch (e) {
          console.warn("[telegram-poll] handleTelegramUpdate error:", (e as Error).message);
        }
      }
    } catch (e) {
      console.warn("[telegram-poll] loop error:", (e as Error).message);
      await sleep(ERROR_BACKOFF_MS);
    }
  }
}

main().catch((e) => {
  console.error("[telegram-poll] fatal:", e);
  process.exit(1);
});
