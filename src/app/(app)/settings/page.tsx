import { Cloud, Download, ListChecks, RefreshCw } from "lucide-react";
import { getDb } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";
import { ImportForm } from "./ImportForm";
import { AutoImportCard } from "./AutoImportCard";
import { isAutoImportEnabled, getLastAutoImport } from "@/lib/auto-importer";

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

  const webhookSet = !!process.env.BITRIX_WEBHOOK_URL?.trim();
  const dryRun = process.env.BITRIX_DRY_RUN !== "false";

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 20 }}>Настройки</h1>

      {/* ───────── Подключение к Битрикс24 ───────── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Cloud size={16} strokeWidth={2} /> Подключение к Битрикс24
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <StatusRow
            label="Входящий вебхук (BITRIX_WEBHOOK_URL)"
            ok={webhookSet}
            okText="Настроен"
            notText="Не задан — задайте в .env на сервере"
          />
          <StatusRow
            label="Режим только-чтение (BITRIX_DRY_RUN)"
            ok={dryRun}
            okText="Включён — в карточки CRM ничего НЕ пишем"
            notText="Выключен — комментарии будут попадать в карточки сделок/лидов"
          />
        </div>

        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
          Для чтения нужен <b>входящий вебхук</b> с правами{" "}
          <code>crm</code>, <code>telephony</code>, <code>user</code>.
          Создаётся в Битрикс24 → Разработчикам → Другое → Входящий вебхук.
          URL положить в <code>.env</code> на VPS, затем <code>pm2 restart call-agent</code>.
        </p>
      </div>

      {/* ───────── Автоматический импорт ───────── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <RefreshCw size={16} strokeWidth={2} /> Автоматический импорт новых звонков
        </h2>
        <AutoImportCard initial={{ enabled: isAutoImportEnabled(), last: getLastAutoImport() }} />
      </div>

      {/* ───────── Импорт исторических звонков ───────── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Download size={16} strokeWidth={2} /> Ручной импорт из истории
        </h2>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 14 }}>
          Подтянуть существующие звонки из Битрикса за выбранный период.
          Скачаем записи, транскрибируем, проанализируем — всё попадёт в <b>Звонки</b> и в дашборд.
          В Битрикс ничего записываться не будет.
        </p>
        {!webhookSet ? (
          <div style={{
            padding: 12, background: "rgba(217,119,6,0.08)",
            border: "1px solid rgba(217,119,6,0.30)",
            borderRadius: 6, fontSize: 13,
          }}>
            Сначала задайте <code>BITRIX_WEBHOOK_URL</code> в <code>.env</code> на сервере.
          </div>
        ) : (
          <ImportForm />
        )}
      </div>

      {/* ───────── Чек-лист QC ───────── */}
      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <ListChecks size={16} strokeWidth={2} /> Чек-лист контроля качества
        </h2>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
          AI оценит каждый пункт от 0 до 1 после каждого звонка.
          Взвешенное среднее = итоговый процент соблюдения скрипта.
        </p>
        <SettingsForm initial={script ?? null} />
      </div>
    </>
  );
}

function StatusRow({ label, ok, okText, notText }: {
  label: string; ok: boolean; okText: string; notText: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span className={ok ? "ds-badge ds-badge-success" : "ds-badge ds-badge-warning"}>
        {ok ? okText : notText}
      </span>
    </div>
  );
}
