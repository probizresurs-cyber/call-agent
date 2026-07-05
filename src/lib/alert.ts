/**
 * Оповещения владельцу (Telegram). Используется для критичных событий, которые
 * иначе тихо копятся в очереди — прежде всего отказ AI-провайдера (квота/биллинг
 * исчерпаны, ключ отозван). Раньше такое замечали только через сутки, вручную.
 *
 * Канал берётся из ENV (ничего не хардкодим):
 *   ALERT_TG_BOT_TOKEN — токен Telegram-бота
 *   ALERT_TG_CHAT_ID   — id чата, куда слать
 *   ALERT_TG_API_BASE  — база Bot API (по умолчанию https://api.telegram.org;
 *                        с РФ-сервера api.telegram.org недоступен напрямую —
 *                        указываем прокси, напр. http://155.212.231.73:8081)
 * Если бот/чат не заданы — функция тихо выходит (алерты просто выключены).
 *
 * Алерт НИКОГДА не роняет пайплайн: любые ошибки отправки проглатываются.
 */
export async function sendOwnerAlert(text: string): Promise<void> {
  const token = process.env.ALERT_TG_BOT_TOKEN?.trim();
  const chatId = process.env.ALERT_TG_CHAT_ID?.trim();
  if (!token || !chatId) return;

  const base = (process.env.ALERT_TG_API_BASE?.trim() || "https://api.telegram.org").replace(/\/+$/, "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    await fetch(`${base}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: controller.signal,
    });
  } catch {
    // Алерт — вспомогательная функция, её сбой не должен ломать обработку звонков.
  } finally {
    clearTimeout(timer);
  }
}
