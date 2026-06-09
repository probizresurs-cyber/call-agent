/**
 * Отправка сообщений в Bitrix24-мессенджер через чат-бота «Call-Agent».
 *
 * Бот регистрируется один раз (imbot.register) — BOT_ID кэшируется в settings.
 * Сообщения уходят от имени бота с аватаркой/названием «Call-Agent», а НЕ от
 * имени сотрудника, под которым создан вебхук. Это выглядит как автоматический
 * сервис, что корректнее для рассылки отчётов.
 *
 * **Безопасность по умолчанию:** под per-tenant DRY_RUN (lib/flags.ts
 * isDryRunForTenant) ничего наружу не уходит — возвращается mode:'dry'.
 *
 * Требует у вебхука прав `imbot`. Если их нет — регистрация/отправка падает;
 * мы НЕ бросаем, а возвращаем { ok:false, error } с понятным сообщением.
 */
import { callBitrixApi } from "./bitrix";
import { isDryRunForTenant } from "./flags";
import { getSetting, setSetting } from "./db";

const BOT_ID_KEY = "bitrix_bot_id";
const BOT_CODE = "call_agent_reports_bot";

export interface ImSendResult {
  ok: boolean;
  mode: "live" | "dry";
  messageId?: number;
  error?: string;
}

/**
 * Гарантирует что чат-бот «Call-Agent» зарегистрирован в Bitrix.
 * Возвращает BOT_ID. Кэширует в settings — регистрация выполняется
 * только один раз на портал.
 *
 * imbot.register требует EVENT_* URL-обработчики. Наш бот не интерактивный
 * (только шлёт), поэтому указываем заглушку-endpoint, отвечающую 200.
 */
async function ensureBot(): Promise<string> {
  const cached = await getSetting(BOT_ID_KEY);
  if (cached && cached.trim()) return cached.trim();

  // Базовый URL для обработчиков событий бота (заглушка — бот не отвечает).
  const handlerUrl = "https://marketradar24.ru/call-agent/api/bitrix-bot/handler";

  const botId = await callBitrixApi<number>("imbot.register", {
    CODE: BOT_CODE,
    TYPE: "B",
    EVENT_MESSAGE_ADD: handlerUrl,
    EVENT_WELCOME_MESSAGE: handlerUrl,
    EVENT_BOT_DELETE: handlerUrl,
    PROPERTIES: {
      NAME: "Call-Agent",
      WORK_POSITION: "AI-аналитик звонков",
      COLOR: "AQUA",
    },
  });

  await setSetting(BOT_ID_KEY, String(botId));
  return String(botId);
}

/**
 * Отправить сообщение в личный чат Bitrix-пользователю (по его Bitrix USER_ID)
 * от имени бота «Call-Agent». MESSAGE поддерживает BBCode ([B], [URL], \n).
 *
 * Под DRY_RUN — не отправляет, только возвращает mode:'dry'.
 */
export async function imSendMessage(
  bitrixUserId: string | number,
  message: string,
  tenantId: number
): Promise<ImSendResult> {
  const dry = await isDryRunForTenant(tenantId);
  if (dry) {
    return { ok: true, mode: "dry" };
  }
  try {
    const botId = await ensureBot();
    // imbot.message.add возвращает ID сообщения (число).
    // DIALOG_ID: число (либо строка из цифр) → личка пользователю по USER_ID;
    //             "chatN" → групповой чат с CHAT_ID=N. Здесь поддерживаются оба варианта.
    const messageId = await callBitrixApi<number>("imbot.message.add", {
      BOT_ID: botId,
      DIALOG_ID: String(bitrixUserId),
      MESSAGE: message,
    });
    return { ok: true, mode: "live", messageId };
  } catch (e) {
    const msg = (e as Error).message;
    // Понятная подсказка если нет прав imbot
    const friendly = /imbot|access|insufficient|method not found/i.test(msg)
      ? `${msg} — проверьте что у вебхука включено право «imbot» (Чат-боты)`
      : msg;
    return { ok: false, mode: "live", error: friendly };
  }
}

// ───────────────────────────────────────────────────────────────────
// Получатели для рассылки отчётов: чаты и пользователи бота.

export interface BotChat {
  /** Для групповых чатов — "chatN" (готовый DIALOG_ID); для личек — bitrix user_id строкой. */
  id: string;
  title: string;
  type: "chat" | "user";
}

/**
 * Список диалогов, в которых участвует бот «Call-Agent».
 *
 * Под капотом — `im.recent.get`. Метод требует контекста сессии бота, поэтому
 * на некоторых порталах может вернуть пустой массив или ошибку прав. В этом
 * случае возвращаем `[]` и не бросаем — UI просто скроет секцию выбора чатов.
 *
 * Структура ответа в Bitrix не вполне стабильна: бывает `{ items: [...] }`,
 * бывает чистый массив. Обрабатываем оба варианта.
 */
export async function listBotChats(): Promise<BotChat[]> {
  try {
    // SKIP_OPENLINES=N — нам нужны и OL-чаты; SKIP_CHAT=N — нам нужны группы.
    const raw = await callBitrixApi<unknown>("im.recent.get", {
      SKIP_OPENLINES: "N",
      SKIP_CHAT: "N",
    });

    // raw может быть либо массивом, либо { items: [...] }
    let items: Array<Record<string, unknown>> = [];
    if (Array.isArray(raw)) {
      items = raw as Array<Record<string, unknown>>;
    } else if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      if (Array.isArray(obj.items)) items = obj.items as Array<Record<string, unknown>>;
    }

    const out: BotChat[] = [];
    for (const it of items) {
      const type = String(it.type ?? "").toLowerCase();
      const rawId = it.id;
      const titleRaw = it.title ?? "";
      if (type === "chat") {
        // id для чата может приходить как число (CHAT_ID) либо как "chatN"
        const idStr =
          typeof rawId === "string" && rawId.startsWith("chat")
            ? rawId
            : `chat${rawId}`;
        out.push({
          id: idStr,
          title: String(titleRaw) || `Чат ${idStr}`,
          type: "chat",
        });
      } else if (type === "user" || type === "private") {
        // Личные диалоги — id равен bitrix user id (число/строка)
        const idStr = String(rawId ?? "");
        if (!idStr) continue;
        // Иногда заголовок лежит в user.name
        let title = String(titleRaw || "");
        if (!title && it.user && typeof it.user === "object") {
          const u = it.user as Record<string, unknown>;
          title = String(u.name ?? u.last_name ?? "") || `ID ${idStr}`;
        }
        out.push({
          id: idStr,
          title: title || `ID ${idStr}`,
          type: "user",
        });
      }
    }
    return out;
  } catch (e) {
    // Best-effort: бот ещё не зарегистрирован / нет прав / метод недоступен —
    // не бросаем, чтобы UI расписаний не падал. Чисто опциональная фича.
    console.warn("[bitrix-im] listBotChats failed:", (e as Error).message);
    return [];
  }
}

/**
 * Проверить что чат существует и доступен боту. Принимает как «chatN», так и просто «N».
 *
 * Возвращает { ok:true, title } если чат найден, либо { ok:false, error } с
 * человеко-читаемым сообщением. Используется в UI при ручном вводе ID.
 */
export async function validateChatId(
  chatId: string
): Promise<{ ok: boolean; title?: string; error?: string }> {
  const raw = chatId.trim();
  if (!raw) return { ok: false, error: "Введите ID чата" };

  // Извлекаем числовой CHAT_ID — нужен для im.chat.get
  const m = raw.match(/^(?:chat)?(\d+)$/i);
  if (!m) {
    return { ok: false, error: "ID чата должен быть числом или вида chatN" };
  }
  const numericId = m[1];
  const dialogId = `chat${numericId}`;

  // Сначала пробуем im.dialog.get (с DIALOG_ID=chatN) — он проверяет ещё и
  // доступ от имени вебхука. Если упало — fallback на im.chat.get(CHAT_ID).
  try {
    const r = await callBitrixApi<Record<string, unknown> | unknown[]>(
      "im.dialog.get",
      { DIALOG_ID: dialogId }
    );
    if (r) {
      const obj = Array.isArray(r) ? (r[0] as Record<string, unknown> | undefined) : r;
      const title = obj && typeof obj === "object" ? (obj.title ?? obj.name) : undefined;
      return { ok: true, title: title ? String(title) : `Чат ${numericId}` };
    }
  } catch {
    // продолжаем — fallback ниже
  }

  try {
    const r = await callBitrixApi<Record<string, unknown>>("im.chat.get", {
      CHAT_ID: numericId,
    });
    if (r && typeof r === "object") {
      const title = (r as Record<string, unknown>).title ?? (r as Record<string, unknown>).name;
      return { ok: true, title: title ? String(title) : `Чат ${numericId}` };
    }
    return { ok: false, error: "Чат не найден или бот не добавлен в чат" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
