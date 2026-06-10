/**
 * /dashboard — основной дашборд для аутентифицированных пользователей.
 *
 * Использует shared loadDashboardData + DashboardSections — те же что в публичном
 * дашборде /public/dashboard/[token], поэтому контент идентичен. Здесь сверху
 * добавлен header c кнопкой «Поделиться» и DashboardFilters, а для роли manager —
 * CoachInsights вместо таблицы менеджеров.
 */
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard-data";
import { DashboardSections } from "@/app/_components/dashboard/DashboardSections";
import { DashboardFilters } from "./DashboardFilters";
import { CoachInsights } from "./CoachInsights";
import { ShareDashboardButton } from "./ShareDashboardButton";
import { ProviderHealthCheckButton } from "./ProviderHealthCheckButton";
import { getDashboardToken } from "@/lib/dashboard-share";
import { getProviderHealth } from "@/lib/provider-health";

export const dynamic = "force-dynamic";

export default async function DashboardPage(props: {
  searchParams: Promise<{ from?: string; to?: string; with_crm?: string; manager_id?: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const sp = await props.searchParams;
  const isManager = me.role === "manager";

  const data = await loadDashboardData({
    tenantId: me.tenantId,
    from: sp.from,
    to: sp.to,
    withCrmOnly: sp.with_crm === "true",
    managerId: !isManager ? sp.manager_id : undefined,
    // Для роли manager — RLS-фильтр по его bitrixManagerId
    managerBitrixId: isManager ? (me.bitrixManagerId ?? undefined) : undefined,
  });

  const periodLabel = (sp.from || sp.to)
    ? `${sp.from ? formatDate(sp.from) : "..."} — ${sp.to ? formatDate(sp.to) : "..."}`
    : "за всё время";

  const dashboardShareToken = isManager ? null : await getDashboardToken(me.tenantId);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://marketradar24.ru";

  // Статус провайдера (OpenAI). При деградации (квота/auth/сеть) — баннер вверху.
  // Видим всем ролям: это важная системная инфа («анализ приостановлен»).
  const providerHealth = await getProviderHealth();
  const showProviderBanner = providerHealth && providerHealth.status !== "ok";

  return (
    <>
      {showProviderBanner && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            background: "color-mix(in srgb, #dc2626 14%, var(--background))",
            border: "1px solid color-mix(in srgb, #dc2626 45%, transparent)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            color: "var(--foreground)",
          }}
        >
          <AlertTriangle size={20} style={{ color: "#dc2626", flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            <b>Анализ звонков приостановлен:</b> {providerHealth.message}. Проверьте баланс/ключ OpenAI.{" "}
            <span style={{ color: "var(--muted-foreground)" }}>
              Обнаружено: {formatDateTime(providerHealth.detected_at)}.
            </span>
            {/* Кнопка перепроверки — только owner/admin (probe дёргает провайдера). */}
            {(me.role === "owner" || me.role === "admin") && <ProviderHealthCheckButton />}
          </div>
        </div>
      )}

      <div className="page-header" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, gap: 12, flexWrap: "wrap",
      }}>
        <h1 className="ds-h1">
          {isManager ? "Мой кабинет" : "Дашборд"}
          {isManager && me.name && (
            <span style={{ fontSize: 16, color: "var(--muted-foreground)", marginLeft: 12, fontWeight: 500 }}>
              · {me.name}
            </span>
          )}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            Период: <b style={{ color: "var(--foreground)" }}>{periodLabel}</b>
          </span>
          {!isManager && (
            <ShareDashboardButton initialToken={dashboardShareToken} baseUrl={baseUrl} />
          )}
        </div>
      </div>

      <DashboardFilters managers={isManager ? undefined : data.managersList} />

      {/* §5.1-§5.2 MASTER-TZ: для менеджера — зоны роста + лента подсказок */}
      {isManager && <CoachInsights user={me} />}

      <DashboardSections data={data} mode={isManager ? "manager" : "private"} />
    </>
  );
}

function formatDate(s: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

/** ISO 8601 → "DD.MM.YYYY HH:MM" (для баннера статуса провайдера). */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
