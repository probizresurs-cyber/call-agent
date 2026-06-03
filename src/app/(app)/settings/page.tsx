import { redirect } from "next/navigation";
import { Cloud, Download, ListChecks, RefreshCw, Users, Settings as SettingsIcon, RotateCcw, UserCog, Shield, Coins, Share2 } from "lucide-react";
import { ImportForm } from "./ImportForm";
import { AutoImportCard } from "./AutoImportCard";
import { ManagersCard } from "./ManagersCard";
import { ScriptsManager } from "./ScriptsManager";
import { DashboardSettingsCard } from "./DashboardSettingsCard";
import { ReanalyzeCard } from "./ReanalyzeCard";
import { UsersCard } from "./UsersCard";
import { FlagsCard } from "./FlagsCard";
import { BudgetCard } from "./BudgetCard";
import { BitrixActivitiesCard } from "./BitrixActivitiesCard";
import { DashboardShareCard } from "./DashboardShareCard";
import { isAutoImportEnabled, getLastAutoImport } from "@/lib/auto-importer";
import { getFlagsSummary } from "@/lib/flags";
import { getTenantBudget, getMonthlyUsage } from "@/lib/budget";
import { getLastFetchedAt } from "@/lib/bitrix-activities";
import { getDashboardToken } from "@/lib/dashboard-share";
import { getSessionUser, canManage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  // Менеджер не имеет доступа к настройкам платформы
  if (!canManage(me.role) && me.role !== "head") redirect("/dashboard");

  const webhookSet = !!process.env.BITRIX_WEBHOOK_URL?.trim();
  const dryRun = process.env.BITRIX_DRY_RUN !== "false";
  const isManager = canManage(me.role);  // owner или admin

  const flags = await getFlagsSummary(me.tenantId);
  const [budget, usage, lastFetchedActivities, dashboardToken] = await Promise.all([
    getTenantBudget(me.tenantId),
    getMonthlyUsage(me.tenantId),
    getLastFetchedAt(),
    getDashboardToken(me.tenantId),
  ]);

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 20 }}>Настройки</h1>

      {/* ───────── Системные флаги (видно только owner/admin) ───────── */}
      {isManager && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={16} strokeWidth={2} /> Системные флаги
          </h2>
          <FlagsCard initial={flags} />
        </div>
      )}

      {/* ───────── Бюджет на обработку (§4.4 MASTER-TZ) ───────── */}
      {isManager && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Coins size={16} strokeWidth={2} /> Бюджет на обработку
          </h2>
          <BudgetCard initial={{ budget, usage }} />
        </div>
      )}

      {/* ───────── Публичная ссылка на дашборд ───────── */}
      {isManager && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Share2 size={16} strokeWidth={2} /> Поделиться дашбордом
          </h2>
          <DashboardShareCard
            initialToken={dashboardToken}
            baseUrl={process.env.NEXT_PUBLIC_BASE_URL || "https://marketradar24.ru"}
          />
        </div>
      )}

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
        <AutoImportCard initial={{ enabled: await isAutoImportEnabled(), last: await getLastAutoImport() }} />
      </div>

      {/* ───────── Email + Open Lines чаты из Bitrix ───────── */}
      {isManager && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCw size={16} strokeWidth={2} /> Email и чаты из Bitrix
          </h2>
          <BitrixActivitiesCard initialLastFetched={lastFetchedActivities} />
        </div>
      )}

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

      {/* ───────── Пользователи платформы (только для owner/admin) ───────── */}
      {isManager && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <UserCog size={16} strokeWidth={2} /> Пользователи платформы
          </h2>
          <UsersCard />
        </div>
      )}

      {/* ───────── Менеджеры Битрикса — видимость ───────── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={16} strokeWidth={2} /> Менеджеры Битрикса — отображение
        </h2>
        <ManagersCard />
      </div>

      {/* ───────── Параметры дашборда ───────── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <SettingsIcon size={16} strokeWidth={2} /> Параметры дашборда
        </h2>
        <DashboardSettingsCard />
      </div>

      {/* ───────── Скрипты продаж и чек-листы ───────── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <ListChecks size={16} strokeWidth={2} /> Скрипты продаж и чек-листы
        </h2>
        <ScriptsManager />
      </div>

      {/* ───────── Переанализ старых звонков ───────── */}
      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <RotateCcw size={16} strokeWidth={2} /> Переанализ старых звонков
        </h2>
        <ReanalyzeCard />
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
