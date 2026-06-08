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
    // imbot.message.add возвращает ID сообщения (число)
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
