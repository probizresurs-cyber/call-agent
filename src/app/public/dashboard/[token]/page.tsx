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
 * Без ?tv=1 — обычный публичный дашборд (как раньше): фильтры + DashboardSections.
 * С ?tv=1 — рендерим <TvBoard/> на весь экран вместо обычных секций.
 */
import { notFound } from "next/navigation";
import { resolveTenantByToken } from "@/lib/dashboard-share";
import { loadDashboardData } from "@/lib/dashboard-data";
import { DashboardSections } from "@/app/_components/dashboard/DashboardSections";
import { DashboardFilters } from "@/app/(app)/dashboard/DashboardFilters";
import { TvBoard } from "@/app/_components/dashboard/TvBoard";
import { PublicDashboardAutoRefresh } from "./AutoRefresh";

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
  // notFound() имеет тип `never`, но из-за отсутствия типов next/navigation (baseline TS7016)
  // TS не сужает tenantId → фиксируем не-null через ! (после guard это безопасно),
  // чтобы не плодить baseline-ошибки TS2322.
  const tenantId = tenantIdOrNull!;

  const tv = sp.tv === "1" || sp.tv === "";

  // ── ТВ-режим: полноэкранное табло ──
  if (tv) {
    // period ∈ today|week|month (default today). Вычисляем from/to той же логикой,
    // что и пресеты в DashboardFilters (пн-вс для недели, 1-е число для месяца).
    const period: TvPeriod =
      sp.period === "week" || sp.period === "month" ? sp.period : "today";
    const { from, to } = tvRange(period);

    const data = await loadDashboardData({ tenantId, from, to });

    return (
      <>
        {/* ТВ висит на стене — обновляем данные с сервера каждые 60 сек */}
        <PublicDashboardAutoRefresh intervalSec={60} />
        <TvBoard
          data={data}
          period={period}
          basePath={`/call-agent/public/dashboard/${token}`}
        />
      </>
    );
  }

  // ── Обычный публичный дашборд (как раньше) ──
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
    <div style={{
      maxWidth: 1400, width: "100%", margin: "0 auto",
      padding: "clamp(0px, 1vw, 12px)", boxSizing: "border-box",
    }}>
      <div className="page-header" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, gap: 12, flexWrap: "wrap",
      }}>
        <h1 className="ds-h1">Дашборд</h1>
        <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
          Период: <b style={{ color: "var(--foreground)" }}>{periodLabel}</b>
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
  );
}

// ── Вычисление from/to для ТВ-периода (та же логика, что в DashboardFilters) ──

function isoDate(d: Date): string {
  // Локальная дата YYYY-MM-DD (без сдвига на UTC)
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
    // Начало недели — понедельник (getDay(): 0=вс, 1=пн, ..., 6=сб)
    const x = new Date(now);
    const day = x.getDay();
    const diff = day === 0 ? 6 : day - 1;
    x.setDate(x.getDate() - diff);
    return { from: isoDate(x), to };
  }
  // month — с 1-го числа текущего месяца
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(first), to };
}

function formatDate(s: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}
