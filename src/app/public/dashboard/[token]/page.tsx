/**
 * Публичный read-only дашборд = точная копия дашборда владельца.
 * URL: /public/dashboard/[token]
 *
 * Query params (как в обычном дашборде):
 *   ?from=2026-06-01&to=2026-06-30 — период
 *   ?manager_id=123                — фильтр по менеджеру
 *   ?with_crm=true                 — только звонки с CRM-привязкой
 *   ?tv=1                          — TV-режим (auto-refresh)
 */
import { notFound } from "next/navigation";
import { resolveTenantByToken } from "@/lib/dashboard-share";
import { loadDashboardData } from "@/lib/dashboard-data";
import { DashboardSections } from "@/app/_components/dashboard/DashboardSections";
import { DashboardFilters } from "@/app/(app)/dashboard/DashboardFilters";
import { PublicDashboardAutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

export default async function PublicDashboardPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    from?: string; to?: string; with_crm?: string;
    manager_id?: string; tv?: string;
  }>;
}) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const tenantId = await resolveTenantByToken(token);
  if (!tenantId) notFound();

  const tv = sp.tv === "1";

  const data = await loadDashboardData({
    tenantId,
    from: sp.from,
    to: sp.to,
    withCrmOnly: sp.with_crm === "true",
    managerId: sp.manager_id,
  });

  const periodLabel = (sp.from || sp.to)
    ? `${sp.from ? formatDate(sp.from) : "..."} — ${sp.to ? formatDate(sp.to) : "..."}`
    : "за всё время";

  return (
    <>
      {tv && <PublicDashboardAutoRefresh intervalSec={30} />}

      <div style={{
        maxWidth: 1400, width: "100%", margin: "0 auto",
        padding: "clamp(0px, 1vw, 12px)", boxSizing: "border-box",
        fontSize: tv ? 16 : 14,
      }}>
        <div className="page-header" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16, gap: 12, flexWrap: "wrap",
        }}>
          <h1 className="ds-h1" style={{ fontSize: tv ? 40 : undefined }}>
            Дашборд
          </h1>
          <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            Период: <b style={{ color: "var(--foreground)" }}>{periodLabel}</b>
            {tv && <span style={{ marginLeft: 12, fontSize: 12 }}>· обновляется каждые 30 сек</span>}
          </span>
        </div>

        <DashboardFilters
          managers={data.managersList}
          basePath={`/public/dashboard/${token}`}
        />

        <DashboardSections data={data} mode="public" />

        <div style={{ textAlign: "center", marginTop: 24, color: "var(--muted-foreground)", fontSize: 11 }}>
          Call-Agent · публичный read-only режим
        </div>
      </div>
    </>
  );
}

function formatDate(s: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}
