/**
 * Отправка сообщений в Bitrix24-мессенджер.
 *
 * ВАЖНОЕ ОГРАНИЧЕНИЕ BITRIX24: `imbot.register` НЕ работает через входящий
 * вебхук — требует client_id от OAuth-приложения. Ошибка «Client ID not
 * specified», даже когда право «imbot» отмечено в вебхуке. Поэтому
 * красивого бота «Call-Agent» через webhook сделать нельзя.
 *
 * Текущий путь: `im.message.add` — обычная отправка сообщения от имени
 * вебхук-пользователя (тот, кто создал webhook). Для получателя выглядит
 * как «Иван прислал отчёт». Это даже естественнее, чем безличный бот.
 *
 * Если в будущем нужен именно бот — нужно регистрировать локальное
 * приложение Bitrix24 (тип «бот») и переключаться на OAuth (отдельная
 * задача). Тогда `imbot.register` пройдёт и можно вернуть старый путь.
 *
 * **Безопасность по умолчанию:** под per-tenant DRY_RUN
 * (kind='messages') ничего наружу не уходит — возвращается mode:'dry'.
 */
import { callBitrixApi } from "./bitrix";
import { isDryRunForTenant } from "./flags";

export interface ImSendResult {
  ok: boolean;
  mode: "live" | "dry";
  messageId?: number;
  error?: string;
}

/**
 * Отправить сообщение в Bitrix-мессенджер. Работает и для лички (USER_ID),
 * и для групповых чатов (DIALOG_ID="chatN").
 *
 * Использует `im.message.add` — обычная отправка от имени вебхук-пользователя.
 * Это единственный путь через входящий вебхук: `imbot.message.add` требует
 * предварительной регистрации бота через `imbot.register`, а та НЕ работает
 * через webhook (нужен OAuth-app, client_id). См. docblock сверху.
 *
 * MESSAGE поддерживает BBCode ([B], [URL], \n).
 *
 * Под DRY_RUN — не отправляет, только возвращает mode:'dry'.
 */
export async function imSendMessage(
  bitrixUserId: string | number,
  message: string,
  tenantId: number
): Promise<ImSendResult> {
  // Отчёты — отдельный класс «messages», независим от CRM-write «crm».
  const dry = await isDryRunForTenant(tenantId, "messages");
  if (dry) {
    return { ok: true, mode: "dry" };
  }
  try {
    // DIALOG_ID: число (либо строка из цифр) → личка пользователю по USER_ID;
    //             "chatN" → групповой чат с CHAT_ID=N. im.message.add поддерживает оба.
    const messageId = await callBitrixApi<number>("im.message.add", {
      DIALOG_ID: String(bitrixUserId),
      MESSAGE: message,
    });
    return { ok: true, mode: "live", messageId };
  } catch (e) {
    const msg = (e as Error).message;
    // Понятная подсказка для типовых проблем
    const friendly = /access\s*denied|insufficient/i.test(msg)
      ? `${msg} — проверьте право «im» (Чат и уведомления) у вебхука`
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

    // Системный спам Bitrix-телефонии и автоуведомлений — фильтруем по
    // характерным заголовкам. На орлинковском портале пришло 62 «Пропущенный
    // звонок. Требуется перезвонить» — это мусор, в селекторе бесполезен.
    // Если завтра прилетит новая разновидность — просто добавь сюда подстроку.
    const SYSTEM_TITLE_PATTERNS = [
      /пропущ.+\s*звонок/i,
      /требуется\s*перезвонить/i,
      /missed\s*call/i,
      /^уведомлени/i,
      /^crm.*уведомлен/i,
    ];
    function isSystemTitle(t: string): boolean {
      return SYSTEM_TITLE_PATTERNS.some((re) => re.test(t));
    }

    const out: BotChat[] = [];
    for (const it of items) {
      const type = String(it.type ?? "").toLowerCase();
      const rawId = it.id;
      const titleRaw = it.title ?? "";
      if (type === "chat") {
        const title = String(titleRaw) || "";
        if (isSystemTitle(title)) continue; // пропускаем системный спам
        // id для чата может приходить как число (CHAT_ID) либо как "chatN"
        const idStr =
          typeof rawId === "string" && rawId.startsWith("chat")
            ? rawId
            : `chat${rawId}`;
        out.push({
          id: idStr,
          title: title || `Чат ${idStr}`,
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
