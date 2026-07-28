/**
 * POST /call-agent/api/telegram/webhook — приём апдейтов Telegram (запасной путь).
 *
 * ОСНОВНОЙ режим бота — polling (scripts/telegram-poll.ts): серверы Telegram
 * не могут достучаться до этого VPS входящим соединением (гео-блок), поэтому
 * сервер сам спрашивает Telegram через getUpdates. Этот роут оставлен на случай,
 * если webhook когда-нибудь снова заработает — сейчас Telegram на него ничего
 * не шлёт (webhook снят через deleteWebhook при старте polling-скрипта).
 *
 * Логика обработки — src/lib/telegram-bot-logic.ts (общая с polling).
 */
import { NextResponse } from "next/server";
import type { TgUpdate } from "@/lib/telegram";
import { handleTelegramUpdate } from "@/lib/telegram-bot-logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram ретраит вебхук, если не получил 200 — поэтому ВСЕГДА отвечаем 200.
function ok() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // Проверка секрета вебхука (если задан).
  const secret = (process.env.CA_TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (secret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return ok();

  try {
    await handleTelegramUpdate(update);
  } catch (e) {
    console.warn("[telegram/webhook] error:", (e as Error).message);
  }
  return ok();
}
