import { getDb } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getDb();
  const script = db
    .prepare(
      `SELECT id, name, content_md, checklist_json, is_active, updated_at
       FROM sales_scripts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1`
    )
    .get() as {
      id: number; name: string; content_md: string;
      checklist_json: string | null; is_active: number; updated_at: string;
    } | undefined;

  const inboundUrl =
    (process.env.APP_BASE_URL || "https://staging.marketradar24.ru/call-agent") +
    "/api/webhook/bitrix" +
    (process.env.BITRIX_INBOUND_TOKEN ? `?token=${process.env.BITRIX_INBOUND_TOKEN}` : "");

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 20 }}>Настройки</h1>

      <div className="ds-card" style={{ marginBottom: 20 }}>
        <h2 className="ds-h3" style={{ marginBottom: 12 }}>Подключение к Битрикс24</h2>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
          В админке Битрикс24: <b>Разработчикам → Другое → Исходящий вебхук</b>.
          События: <code>OnVoximplantCallEnd</code>, <code>ONCRMACTIVITYADD</code>.
          URL обработчика:
        </p>
        <code style={{
          display: "block", padding: 10, background: "var(--muted)",
          borderRadius: 6, fontSize: 12, wordBreak: "break-all",
        }}>{inboundUrl}</code>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 12 }}>
          Для обратной записи в карточку CRM нужен <b>входящий вебхук</b>
          с правами <code>crm</code>, <code>telephony</code>, <code>user</code> — его URL
          задаётся переменной <code>BITRIX_WEBHOOK_URL</code> в .env.
        </p>
      </div>

      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 8 }}>Чек-лист контроля качества</h2>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
          AI оценит каждый пункт от 0 до 1 после каждого звонка.
          Взвешенное среднее = итоговый процент соблюдения скрипта.
        </p>
        <SettingsForm initial={script ?? null} />
      </div>
    </>
  );
}
