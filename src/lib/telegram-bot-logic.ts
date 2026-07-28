/**
 * Общая логика Telegram-бота отчётов Call-Agent — переиспользуется polling-скриптом
 * (scripts/telegram-poll.ts, основной режим) и webhook-роутом (запасной вариант,
 * см. src/app/api/telegram/webhook/route.ts).
 *
 * Сценарий: пользователь пишет боту → меню (inline-кнопки):
 *   «За всё время» / «За сегодня» / «За конкретную дату»
 * нажатие кнопки → генерируем отчёт по отделу и присылаем текст.
 * «За конкретную дату» → просим прислать дату ДД.ММ.ГГГГ, любое сообщение-дата
 *   → отчёт за этот день.
 *
 * ДОСТУП (данные продаж — чувствительные):
 *   CA_TELEGRAM_ALLOWED_CHAT_IDS — список разрешённых chat_id через запятую.
 *   Спецзначение "*" — временный режим «отвечать всем» (для настройки/теста),
 *   отключить, заменив на конкретные chat_id, как только они известны.
 *   Пусто → доступа нет ни у кого (безопасный дефолт).
 *   Незнакомому чату бот присылает его chat_id — так его и узнают.
 */
import { tgSendMessage, tgAnswerCallback, type TgUpdate } from "./telegram";
import { generateReport } from "./reports";

const TENANT_ID = parseInt(process.env.CA_TELEGRAM_TENANT_ID || "1", 10) || 1;

// Меню отчётов (inline-клавиатура).
const MENU = {
  inline_keyboard: [
    [{ text: "За всё время", callback_data: "rep:all" }],
    [{ text: "За сегодня", callback_data: "rep:today" }],
    [{ text: "За конкретную дату", callback_data: "rep:date" }],
  ],
};

/** "*" → разрешено всем (временный режим); иначе — allowlist конкретных chat_id. */
function isAllowed(chatId: string): boolean {
  const raw = (process.env.CA_TELEGRAM_ALLOWED_CHAT_IDS || "").trim();
  if (raw === "*") return true;
  const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return set.size > 0 && set.has(chatId);
}

/** Ответ незнакомому чату: показываем его chat_id для подключения. */
async function denyReply(chatId: string) {
  await tgSendMessage(
    chatId,
    `Доступ к отчётам ограничен.\nВаш chat ID: ${chatId}\nПередайте этот ID администратору, чтобы получить доступ.`
  );
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

/** Обработать один апдейт Telegram (сообщение или нажатие кнопки). */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  // ── Нажатие inline-кнопки ──
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? "");
    await tgAnswerCallback(cq.id);
    if (!chatId) return;
    if (!isAllowed(chatId)) {
      await denyReply(chatId);
      return;
    }
    const data = String(cq.data || "");
    if (data === "rep:all") await sendReport(chatId, "all");
    else if (data === "rep:today") await sendReport(chatId, "today");
    else if (data === "rep:date")
      await tgSendMessage(chatId, "Пришлите дату в формате ДД.ММ.ГГГГ (например, 05.02.2026).");
    return;
  }

  // ── Обычное сообщение ──
  const msg = update.message;
  if (msg?.chat?.id != null) {
    const chatId = String(msg.chat.id);
    const text = String(msg.text || "").trim();
    if (!isAllowed(chatId)) {
      await denyReply(chatId);
      return;
    }
    // Сообщение-дата → отчёт за конкретный день.
    const date = parseDate(text);
    if (date) {
      await sendReport(chatId, "date", date);
      return;
    }
    // /start или любой другой текст → показываем меню.
    await tgSendMessage(chatId, "Выберите отчёт по отделу продаж:", { reply_markup: MENU });
  }
}
