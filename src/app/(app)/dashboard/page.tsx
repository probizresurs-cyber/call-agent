/**
 * /dashboard — основной дашборд для аутентифицированных пользователей.
 *
 * Использует shared loadDashboardData + DashboardSections — те же что в публичном
 * дашборде /public/dashboard/[token], поэтому контент идентичен. Здесь сверху
 * добавлен header c кнопкой «Поделиться» и DashboardFilters, а для роли manager —
 * CoachInsights вместо таблицы менеджеров.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard-data";
import { DashboardSections } from "@/app/_components/dashboard/DashboardSections";
import { DashboardFilters } from "./DashboardFilters";
import { CoachInsights } from "./CoachInsights";
import { ShareDashboardButton } from "./ShareDashboardButton";
import { getDashboardToken } from "@/lib/dashboard-share";

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

  return (
    <>
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
