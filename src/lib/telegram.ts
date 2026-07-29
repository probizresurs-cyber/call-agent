/**
 * Клиент Telegram Bot API для интерактивного бота отчётов Call-Agent.
 *
 * Бот работает через LONG POLLING (scripts/telegram-poll.ts), а не webhook:
 * входящие соединения от серверов Telegram до этого VPS не проходят (тот же
 * гео-блок, что и для исходящих OpenAI/Anthropic — только в обратную сторону),
 * поэтому вместо «Telegram стучится к нам» сервер сам периодически спрашивает
 * «есть новые сообщения?» через getUpdates — это исходящий запрос, идёт через
 * прокси CA_TELEGRAM_BASE_URL и работает надёжно.
 *
 * Логика обработки сообщений — src/lib/telegram-bot-logic.ts (общая для
 * polling и на случай, если webhook когда-нибудь снова заработает).
 *
 * СЕКРЕТЫ: токен берётся ТОЛЬКО из process.env.CA_TELEGRAM_BOT_TOKEN,
 * НИКОГДА не хардкодится и не логируется.
 */

// Лимит длины сообщения Telegram — 4096; берём с запасом.
const TG_LIMIT = 4000;

// ВАЖНО: base()/token() — функции, а НЕ константы верхнего уровня. В standalone-
// скриптах (scripts/telegram-poll.ts) import-декларации ES-модулей поднимаются
// и выполняются ДО loadEnv(), поэтому `const BASE = process.env...` на верхнем
// уровне модуля зафиксировал бы пустое значение (ещё до чтения .env) и всегда
// бил бы в заблокированный api.telegram.org напрямую, игнорируя прокси. Внутри
// Next.js-приложения этой проблемы нет (там .env грузится фреймворком раньше
// любого кода), но лениво читать process.env правильно в обоих случаях.
function base(): string {
  return (process.env.CA_TELEGRAM_BASE_URL || "https://api.telegram.org").replace(/\/+$/, "");
}

function token(): string {
  return (process.env.CA_TELEGRAM_BOT_TOKEN || "").trim();
}

/** Настроен ли бот (задан ли токен). */
export function telegramConfigured(): boolean {
  return token().length > 0;
}

/** Низкоуровневый вызов метода Bot API. Токен в URL не логируем.
 *  timeoutMs — клиентский таймаут fetch (по умолчанию 15с; для getUpdates
 *  передаём больше, чтобы не оборвать long-poll раньше времени). */
async function api<T = unknown>(
  method: string,
  body: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<{ ok: boolean; result?: T; error?: string }> {
  const t = token();
  if (!t) return { ok: false, error: "CA_TELEGRAM_BOT_TOKEN не задан" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base()}/bot${t}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: T; description?: string }
      | null;
    if (data?.ok) return { ok: true, result: data.result };
    return { ok: false, error: data?.description || `Telegram HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Разбить длинный текст на части ≤ limit по границам строк. */
function splitText(text: string, limit = TG_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if ((buf ? buf.length + 1 : 0) + line.length > limit) {
      if (buf) parts.push(buf);
      if (line.length > limit) {
        // Слишком длинная одиночная строка — режем жёстко.
        for (let i = 0; i < line.length; i += limit) parts.push(line.slice(i, i + limit));
        buf = "";
      } else {
        buf = line;
      }
    } else {
      buf = buf ? `${buf}\n${line}` : line;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

/**
 * Отправить текстовое сообщение (с авторазбивкой длинных сообщений).
 * extra.parse_mode (если задан) применяется КО ВСЕМ частям — нужно, чтобы HTML-
 * теги (например, незакрытый <pre> в отчёте) не сломались, если текст вдруг
 * разобьётся на несколько сообщений. Остальные поля extra (например,
 * reply_markup с меню) применяются только к ПОСЛЕДНЕЙ части.
 * Без extra.parse_mode отправляем как plain text — по умолчанию безопасно
 * для текста с произвольными символами (BBCode-теги Bitrix и т.п.).
 */
export async function tgSendMessage(
  chatId: string | number,
  text: string,
  extra?: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const { parse_mode, ...restExtra } = extra || {};
  const parts = splitText(text);
  let last: { ok: boolean; error?: string } = { ok: true };
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    last = await api("sendMessage", {
      chat_id: chatId,
      text: parts[i],
      disable_web_page_preview: true,
      ...(parse_mode ? { parse_mode } : {}),
      ...(isLast && Object.keys(restExtra).length ? restExtra : {}),
    });
    if (!last.ok) return last;
  }
  return last;
}

/** Ответить на нажатие inline-кнопки (убирает «часики» на кнопке). */
export async function tgAnswerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await api("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

/** Зарегистрировать webhook (не используется в проде — оставлено на случай,
 *  если гео-блок входящих когда-нибудь снимут; сейчас бот работает через polling). */
export async function tgSetWebhook(
  url: string,
  secret: string
): Promise<{ ok: boolean; error?: string }> {
  const r = await api("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  return { ok: r.ok, error: r.error };
}

/** Снять webhook — обязательно перед началом polling (getUpdates), иначе Telegram
 *  вернёт 409 Conflict («terminated by other getUpdates request» / webhook active). */
export async function tgDeleteWebhook(): Promise<{ ok: boolean; error?: string }> {
  const r = await api("deleteWebhook", { drop_pending_updates: false });
  return { ok: r.ok, error: r.error };
}

// ── Минимальные типы апдейта Telegram (только используемые поля) ──
export interface TgChat {
  id: number | string;
}
export interface TgMessage {
  chat?: TgChat;
  text?: string;
}
export interface TgCallbackQuery {
  id: string;
  data?: string;
  from?: { id: number | string };
  message?: { chat?: TgChat };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

/**
 * Long polling: получить новые апдейты (ждёт до timeoutSec секунд, если их нет).
 * offset — update_id последнего обработанного + 1 (Telegram подтверждает получение
 * предыдущих апдейтов, когда offset больше их update_id, и больше их не присылает).
 */
export async function tgGetUpdates(
  offset: number,
  timeoutSec = 25
): Promise<{ ok: boolean; updates: TgUpdate[]; error?: string }> {
  const r = await api<TgUpdate[]>(
    "getUpdates",
    {
      offset,
      timeout: timeoutSec,
      allowed_updates: ["message", "callback_query"],
    },
    (timeoutSec + 10) * 1000 // клиентский таймаут с запасом над серверным long-poll
  );
  if (!r.ok) return { ok: false, updates: [], error: r.error };
  return { ok: true, updates: r.result ?? [] };
}
