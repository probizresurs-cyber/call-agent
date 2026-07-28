/**
 * POST /call-agent/api/telegram/webhook — приём апдейтов Telegram-бота.
 *
 * Сценарий (интерактивный бот, без фиксированного чата):
 *   пользователь пишет боту → меню (inline-кнопки):
 *     «За всё время» / «За сегодня» / «За конкретную дату»
 *   нажатие кнопки → бот генерирует отчёт по отделу и присылает текст.
 *   «За конкретную дату» → бот просит прислать дату ДД.ММ.ГГГГ,
 *     любое сообщение-дата → отчёт за этот день.
 *
 * БЕЗОПАСНОСТЬ (данные продаж — чувствительные):
 *   - отвечает отчётами ТОЛЬКО чатам из allowlist CA_TELEGRAM_ALLOWED_CHAT_IDS;
 *   - незнакомому чату присылает его chat_id + «доступ ограничен»
 *     (это и способ узнать chat_id при настройке);
 *   - проверяет секрет вебхука (заголовок X-Telegram-Bot-Api-Secret-Token).
 *
 * Тенант отчётов — CA_TELEGRAM_TENANT_ID (по умолчанию 1 = основной).
 */
import { NextResponse } from "next/server";
import { tgSendMessage, tgAnswerCallback } from "@/lib/telegram";
import { generateReport } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = parseInt(process.env.CA_TELEGRAM_TENANT_ID || "1", 10) || 1;

// Меню отчётов (inline-клавиатура).
const MENU = {
  inline_keyboard: [
    [{ text: "За всё время", callback_data: "rep:all" }],
    [{ text: "За сегодня", callback_data: "rep:today" }],
    [{ text: "За конкретную дату", callback_data: "rep:date" }],
  ],
};

/** Разрешённые chat_id (пусто → доступа нет ни у кого, чтобы данные не утекали). */
function allowedChats(): Set<string> {
  return new Set(
    (process.env.CA_TELEGRAM_ALLOWED_CHAT_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}
function isAllowed(chatId: string): boolean {
  const set = allowedChats();
  return set.size > 0 && set.has(chatId);
}

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
    // ── Нажатие inline-кнопки ──
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? "");
      await tgAnswerCallback(cq.id);
      if (!chatId) return ok();
      if (!isAllowed(chatId)) {
        await denyReply(chatId);
        return ok();
      }
      const data = String(cq.data || "");
      if (data === "rep:all") await sendReport(chatId, "all");
      else if (data === "rep:today") await sendReport(chatId, "today");
      else if (data === "rep:date")
        await tgSendMessage(chatId, "Пришлите дату в формате ДД.ММ.ГГГГ (например, 05.02.2026).");
      return ok();
    }

    // ── Обычное сообщение ──
    const msg = update.message;
    if (msg?.chat?.id != null) {
      const chatId = String(msg.chat.id);
      const text = String(msg.text || "").trim();
      if (!isAllowed(chatId)) {
        await denyReply(chatId);
        return ok();
      }
      // Сообщение-дата → отчёт за конкретный день.
      const date = parseDate(text);
      if (date) {
        await sendReport(chatId, "date", date);
        return ok();
      }
      // /start или любой другой текст → показываем меню.
      await tgSendMessage(chatId, "Выберите отчёт по отделу продаж:", { reply_markup: MENU });
      return ok();
    }
  } catch (e) {
    console.warn("[telegram/webhook] error:", (e as Error).message);
  }
  return ok();
}

/** Ответ незнакомому чату: показываем его chat_id для подключения. */
async function denyReply(chatId: string) {
  await tgSendMessage(
    chatId,
    `Доступ к отчётам ограничен.\nВаш chat ID: ${chatId}\nПередайте этот ID администратору, чтобы получить доступ.`
  );
}

/** Сгенерировать и отправить отчёт по команде. */
async function sendReport(chatId: string, kind: "all" | "today" | "date", date?: string) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = iso(new Date());

  let from: string;
  let to: string;
  let label: string;
  if (kind === "all") {
    from = "2000-01-01";
    to = today;
    label = "За всё время";
  } else if (kind === "today") {
    from = today;
    to = today;
    label = "Сегодня";
  } else {
    from = date!;
    to = date!;
    label = ruDate(date!);
  }

  await tgSendMessage(chatId, "Готовлю отчёт…");
  try {
    const report = await generateReport({
      tenantId: TENANT_ID,
      scope: "team",
      from,
      to,
      periodLabel: label,
    });
    await tgSendMessage(chatId, report.text, { reply_markup: MENU });
  } catch (e) {
    await tgSendMessage(
      chatId,
      `Не удалось построить отчёт: ${e instanceof Error ? e.message : "ошибка"}. Попробуйте ещё раз.`,
      { reply_markup: MENU }
    );
  }
}

/** Разобрать дату из текста: ДД.ММ.ГГГГ / ДД-ММ-ГГГГ / ГГГГ-ММ-ДД → ISO YYYY-MM-DD. */
function parseDate(text: string): string | null {
  let m = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${m[3]}-${mo}-${d}`;
    return null;
  }
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return text;
  return null;
}

/** ISO YYYY-MM-DD → ДД.ММ.ГГГГ. */
function ruDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// ── Минимальные типы апдейта Telegram (только используемые поля) ──
interface TgChat {
  id: number | string;
}
interface TgMessage {
  chat?: TgChat;
  text?: string;
}
interface TgCallbackQuery {
  id: string;
  data?: string;
  from?: { id: number | string };
  message?: { chat?: TgChat };
}
interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
