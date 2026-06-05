import { redirect } from "next/navigation";
import { Bot, Cloud, Download, ListChecks, RefreshCw, Users, Settings as SettingsIcon, RotateCcw, UserCog, Shield, Coins, Share2, Scale } from "lucide-react";
import { ImportForm } from "./ImportForm";
import { AutoImportCard } from "./AutoImportCard";
import { ManagersCard } from "./ManagersCard";
import { ScriptsManager } from "./ScriptsManager";
import { DashboardSettingsCard } from "./DashboardSettingsCard";
import { ReanalyzeCard } from "./ReanalyzeCard";
import { UsersCard } from "./UsersCard";
import { FlagsCard } from "./FlagsCard";
import { ModelCard } from "./ModelCard";
import { BudgetCard } from "./BudgetCard";
import { BitrixActivitiesCard } from "./BitrixActivitiesCard";
import { DashboardShareCard } from "./DashboardShareCard";
import { DiscrepancyCard, type DiscrepancyInitial, type RecipientUser } from "./DiscrepancyCard";
import { isAutoImportEnabled, getLastAutoImport } from "@/lib/auto-importer";
import { getFlagsSummary } from "@/lib/flags";
import { getTenantBudget, getMonthlyUsage } from "@/lib/budget";
import { getLastFetchedAt } from "@/lib/bitrix-activities";
import { getDashboardToken } from "@/lib/dashboard-share";
import { getSessionUser, canManage } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

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

  const analysisModel = isManager
    ? await getDbAsync()
        .prepare("SELECT analysis_model FROM tenants WHERE id = ?")
        .get<{ analysis_model: string | null }>(me.tenantId)
        .then((r) => r?.analysis_model ?? null)
        .catch(() => null)
    : null;

  const [budget, usage, lastFetchedActivities, dashboardToken] = await Promise.all([
    getTenantBudget(me.tenantId),
    getMonthlyUsage(me.tenantId),
    getLastFetchedAt(),
    getDashboardToken(me.tenantId),
  ]);

  // ───── Настройки модуля «Сравнение с CRM-карточкой» (owner/admin/head) ─────
  // Колонки tenants.discrepancy_* добавляет параллельный агент. Если миграция
  // ещё не накатилась — отдаём дефолты и не падаем (try/catch).
  const canSeeDiscrepancy = isManager || me.role === "head";
  let discrepancyInitial: DiscrepancyInitial = {
    enabled: false,
    recipientMode: "manager",
    adminUserIds: [],
    actionMode: "manual",
    customFields: null,
    severityMin: "medium",
  };
  let discrepancyRecipients: RecipientUser[] = [];
  if (canSeeDiscrepancy) {
    const db = getDbAsync();

    // ① Загружаем список получателей — простой запрос, не зависит от миграций discrepancy_*
    try {
      const recipientRows = await db
        .prepare(
          `SELECT id, login, role, name FROM users
             WHERE tenant_id = ?
               AND role IN ('head','owner','admin')
             ORDER BY
               CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
               name, login`
        )
        .all<{ id: number; login: string; role: "owner" | "admin" | "head"; name: string | null }>(me.tenantId);
      discrepancyRecipients = recipientRows.map((r) => ({
        id: Number(r.id),
        login: r.login,
        role: r.role,
        name: r.name,
      }));
    } catch (e) {
      console.warn("[settings] failed to load discrepancy recipients:", (e as Error).message);
    }

    // Гарантируем что текущий пользователь всегда в списке
    const meRole = me.role as "owner" | "admin" | "head" | "manager";
    if (
      (meRole === "owner" || meRole === "admin" || meRole === "head") &&
      !discrepancyRecipients.some((r) => r.id === me.id)
    ) {
      discrepancyRecipients = [
        { id: me.id, login: me.login, role: meRole as "owner" | "admin" | "head", name: me.name },
        ...discrepancyRecipients,
      ];
    }

    // ② Загружаем настройки тенанта — может упасть если колонки discrepancy_* ещё не накатились
    try {
      const row = await db
        .prepare(
          `SELECT discrepancy_enabled, discrepancy_recipient_mode, discrepancy_admin_user_ids,
                  discrepancy_action_mode, discrepancy_custom_fields, discrepancy_severity_min
             FROM tenants WHERE id = ?`
        )
        .get<{
          discrepancy_enabled: boolean | number | null;
          discrepancy_recipient_mode: string | null;
          discrepancy_admin_user_ids: string | null;
          discrepancy_action_mode: string | null;
          discrepancy_custom_fields: string | null;
          discrepancy_severity_min: string | null;
        }>(me.tenantId);
      if (row) {
        const recipientMode = (row.discrepancy_recipient_mode === "admins" ? "admins" : "manager") as "manager" | "admins";
        const actionMode = (row.discrepancy_action_mode === "auto_approve" ? "auto_approve" : "manual") as "manual" | "auto_approve";
        const sev = row.discrepancy_severity_min;
        const severityMin = (sev === "low" || sev === "high" ? sev : "medium") as "low" | "medium" | "high";
        let adminUserIds: number[] = [];
        if (row.discrepancy_admin_user_ids) {
          try {
            const parsed = JSON.parse(row.discrepancy_admin_user_ids) as unknown;
            if (Array.isArray(parsed)) {
              adminUserIds = parsed.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
            }
          } catch { /* ignore malformed JSON */ }
        }
        let customFields: string[] | null = null;
        if (row.discrepancy_custom_fields != null) {
          try {
            const parsed = JSON.parse(row.discrepancy_custom_fields) as unknown;
            if (Array.isArray(parsed)) {
              customFields = parsed.map((v) => String(v).trim()).filter(Boolean);
              if (customFields.length === 0) customFields = null;
            }
          } catch { /* ignore malformed JSON */ }
        }
        discrepancyInitial = {
          enabled: row.discrepancy_enabled === true || row.discrepancy_enabled === 1,
          recipientMode,
          adminUserIds,
          actionMode,
          customFields,
          severityMin,
        };
      }
    } catch (e) {
      console.warn("[settings] failed to load discrepancy tenant settings:", (e as Error).message);
    }
  }

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

      {/* ───────── Модель для анализа (видно только owner/admin) ───────── */}
      {isManager && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={16} strokeWidth={2} /> Модель для анализа
          </h2>
          <ModelCard initial={analysisModel} />
        </div>
      )}

      {/* ───────── Сравнение с CRM-карточкой (видно owner/admin/head) ───────── */}
      {canSeeDiscrepancy && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Scale size={16} strokeWidth={2} /> Сравнение с CRM-карточкой
          </h2>
          <DiscrepancyCard initial={discrepancyInitial} recipients={discrepancyRecipients} />
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
