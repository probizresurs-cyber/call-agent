/**
 * Публичный read-only дашборд = точная копия дашборда владельца.
 * URL: /public/dashboard/[token]
 *
 * Query params (как в обычном дашборде):
 *   ?from=2026-06-01&to=2026-06-30 — период
 *   ?manager_id=123                — фильтр по менеджеру
 *   ?with_crm=true                 — только звонки с CRM-привязкой
 *   ?tv=1                          — ТВ-режим: полноэкранное табло (карусель по менеджерам)
 *   ?period=today|week|month       — период для ТВ-режима (крупные кнопки, без датпикера)
 *
 * Без ?tv=1 — обычный публичный дашборд: брендированная шапка (ReportChrome) с
 * тумблером темы + запоминанием вида + трекером захода, фильтры, DashboardSections.
 * С ?tv=1 — рендерим <TvBoard/> на весь экран вместо обычных секций.
 */
import { notFound } from "next/navigation";
import { resolveTenantByToken } from "@/lib/dashboard-share";
import { getTenantName } from "@/lib/report-views";
import { loadDashboardData } from "@/lib/dashboard-data";
import { DashboardSections } from "@/app/_components/dashboard/DashboardSections";
import { DashboardFilters } from "@/app/(app)/dashboard/DashboardFilters";
import { TvBoard } from "@/app/_components/dashboard/TvBoard";
import { PublicDashboardAutoRefresh } from "./AutoRefresh";
import { ReportChrome } from "./ReportChrome";

export const dynamic = "force-dynamic";

type TvPeriod = "today" | "week" | "month";

export default async function PublicDashboardPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    from?: string; to?: string; with_crm?: string;
    manager_id?: string; tv?: string; period?: string;
  }>;
}) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const tenantIdOrNull = await resolveTenantByToken(token);
  if (!tenantIdOrNull) notFound();
  const tenantId = tenantIdOrNull!;

  const tv = sp.tv === "1" || sp.tv === "";

  // ── ТВ-режим: полноэкранное табло ──
  if (tv) {
    const period: TvPeriod =
      sp.period === "week" || sp.period === "month" ? sp.period : "today";
    const { from, to } = tvRange(period);

    const data = await loadDashboardData({ tenantId, from, to });

    return (
      <>
        {/* ТВ висит на стене — обновляем данные с сервера каждые 60 сек + трекер захода */}
        <PublicDashboardAutoRefresh intervalSec={60} token={token} kind="tv" />
        <TvBoard
          data={data}
          period={period}
          basePath={`/call-agent/public/dashboard/${token}`}
        />
      </>
    );
  }

  // ── Обычный публичный дашборд ──
  const [data, tenantName] = await Promise.all([
    loadDashboardData({
      tenantId,
      from: sp.from,
      to: sp.to,
      withCrmOnly: sp.with_crm === "true",
      managerId: sp.manager_id,
    }),
    getTenantName(tenantId),
  ]);

  const periodLabel = (sp.from || sp.to)
    ? `${sp.from ? formatDate(sp.from) : "..."} — ${sp.to ? formatDate(sp.to) : "..."}`
    : "за всё время";

  return (
    <div style={{
      maxWidth: 1400, width: "100%", margin: "0 auto",
      padding: "clamp(0px, 1vw, 12px)", boxSizing: "border-box",
    }}>
      <ReportChrome
        token={token}
        tenantName={tenantName}
        periodLabel={periodLabel}
      />

      <DashboardFilters
        managers={data.managersList}
        basePath={`/public/dashboard/${token}`}
      />

      <DashboardSections data={data} mode="public" />

      <div style={{ textAlign: "center", marginTop: 24, color: "var(--muted-foreground)", fontSize: 11 }}>
        Call-Agent · публичный read-only режим
      </div>
    </div>
  );
}

// ── Вычисление from/to для ТВ-периода (та же логика, что в DashboardFilters) ──

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tvRange(period: TvPeriod): { from: string; to: string } {
  const now = new Date();
  const to = isoDate(now);
  if (period === "today") {
    return { from: to, to };
  }
  if (period === "week") {
    const x = new Date(now);
    const day = x.getDay();
    const diff = day === 0 ? 6 : day - 1;
    x.setDate(x.getDate() - diff);
    return { from: isoDate(x), to };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(first), to };
}

function formatDate(s: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}
