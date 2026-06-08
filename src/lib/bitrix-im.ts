/**
 * Отправка сообщений в Bitrix24-мессенджер (личные чаты) через входящий
 * вебхук. Используется для рассылки отчётов менеджерам/руководителю.
 *
 * **Безопасность по умолчанию:** под per-tenant DRY_RUN (lib/flags.ts
 * isDryRunForTenant) ничего наружу не уходит — возвращается mode:'dry'.
 *
 * Требует у вебхука прав `im`. Если их нет — im.message.add падает;
 * мы НЕ бросаем, а возвращаем { ok:false, error } чтобы вызывающий код
 * мог показать понятную ошибку пользователю.
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
 * Отправить сообщение в личный чат Bitrix-пользователю (по его Bitrix USER_ID).
 * im.message.add с DIALOG_ID = userId шлёт в личку этому пользователю от имени
 * вебхук-бота. MESSAGE поддерживает BBCode ([B], [URL], переносы строк).
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
    // im.message.add возвращает ID сообщения (число)
    const messageId = await callBitrixApi<number>("im.message.add", {
      DIALOG_ID: String(bitrixUserId),
      MESSAGE: message,
    });
    return { ok: true, mode: "live", messageId };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}
