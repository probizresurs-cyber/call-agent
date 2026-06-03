/**
 * Публичный read-only дашборд. URL: /public/dashboard/[token].
 * Любой кто знает токен видит KPI и таблицу менеджеров тенанта.
 *
 * Опции через query:
 *   ?tv=1   → TV-режим: крупный текст, auto-refresh каждые 30 сек
 *   ?from=2026-06-01&to=2026-06-30 → период
 */
import { notFound } from "next/navigation";
import { Phone, CheckCircle2, Clock, AlertTriangle, FileX, Star, ClipboardList, Timer, ArrowDownLeft } from "lucide-react";
import { getDbAsync } from "@/lib/db-compat";
import { resolveTenantByToken } from "@/lib/dashboard-share";
import { PublicDashboardAutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

interface KpiCardProps { icon: React.ElementType; label: string; value: string; color?: string; large?: boolean }
function Kpi({ icon: Icon, label, value, color, large }: KpiCardProps) {
  return (
    <div className="ds-card" style={{ padding: large ? "20px 24px" : "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color, marginBottom: 6 }}>
        <Icon size={large ? 22 : 16} strokeWidth={2} />
        <span style={{
          textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5,
          fontSize: large ? 14 : 11, color: color || "var(--muted-foreground)",
        }}>{label}</span>
      </div>
      <div style={{ fontSize: large ? 42 : 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

export default async function PublicDashboardPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ from?: string; to?: string; tv?: string }>;
}) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  const tenantId = await resolveTenantByToken(token);
  if (!tenantId) notFound();

  const tv = sp.tv === "1";
  const db = getDbAsync();

  const where: string[] = ["c.tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (sp.from) { where.push("substr(c.started_at,1,10) >= ?"); params.push(sp.from); }
  if (sp.to)   { where.push("substr(c.started_at,1,10) <= ?"); params.push(sp.to); }
  const whereSql = "WHERE " + where.join(" AND ");

  const totals = await db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN status IN ('pending','downloading','transcribing','analyzing','syncing') THEN 1 ELSE 0 END) AS in_progress,
       SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status='no_recording' THEN 1 ELSE 0 END) AS no_recording,
       SUM(CASE WHEN direction='in' THEN 1 ELSE 0 END) AS incoming,
       SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END) AS outgoing,
       COALESCE(AVG(duration_sec), 0) AS avg_duration
     FROM calls c
     ${whereSql}`
  ).get<{
    total: number; done: number; in_progress: number; failed: number; no_recording: number;
    incoming: number; outgoing: number; avg_duration: number;
  }>(...params);

  const aggs = await db.prepare(
    `SELECT AVG(a.manager_score) AS avg_score, AVG(a.script_compliance) AS avg_compliance
     FROM calls c JOIN analyses a ON a.call_id = c.id
     ${whereSql}`
  ).get<{ avg_score: number | null; avg_compliance: number | null }>(...params);

  const managers = await db.prepare(
    `SELECT c.manager_id,
            COALESCE(MAX(c.manager_name), MAX(m.name), '') AS manager_name,
            COUNT(*) AS calls,
            SUM(CASE WHEN c.duration_sec >= 15 THEN 1 ELSE 0 END) AS connected,
            COALESCE(SUM(c.duration_sec), 0) AS total_seconds,
            AVG(a.manager_score) AS avg_score,
            AVG(a.script_compliance) AS avg_compliance
     FROM calls c
     LEFT JOIN analyses a ON a.call_id = c.id
     LEFT JOIN managers m ON m.id = c.manager_id
     WHERE c.tenant_id = ?
       AND c.manager_id IS NOT NULL AND c.manager_id != ''
       AND (m.is_active IS NULL OR m.is_active = 1)
       ${sp.from ? "AND substr(c.started_at,1,10) >= ?" : ""}
       ${sp.to   ? "AND substr(c.started_at,1,10) <= ?" : ""}
     GROUP BY c.manager_id
     ORDER BY calls DESC
     LIMIT 30`
  ).all<{
    manager_id: string; manager_name: string;
    calls: number; connected: number; total_seconds: number;
    avg_score: number | null; avg_compliance: number | null;
  }>(...[tenantId, ...(sp.from ? [sp.from] : []), ...(sp.to ? [sp.to] : [])]);

  const fontSize = tv ? 18 : 14;
  const headerSize = tv ? 48 : 32;

  return (
    <>
      {tv && <PublicDashboardAutoRefresh intervalSec={30} />}

      <div style={{ maxWidth: 1400, margin: "0 auto", fontSize }}>
        <div className="page-header" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <h1 style={{ fontSize: headerSize, fontWeight: 700, margin: 0 }}>
            Call-Agent · Дашборд
          </h1>
          <div style={{ color: "var(--muted-foreground)", fontSize: tv ? 18 : 13 }}>
            {sp.from || sp.to
              ? `Период: ${sp.from || "..."} — ${sp.to || "..."}`
              : "За всё время"}
            {tv && " · обновляется каждые 30 сек"}
          </div>
        </div>

        <div className="kpi-grid-5" style={{
          display: "grid",
          gridTemplateColumns: tv ? "repeat(5, 1fr)" : "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12, marginBottom: 16,
        }}>
          <Kpi icon={Phone} label="Всего звонков" value={String(totals?.total ?? 0)} large={tv} />
          <Kpi icon={CheckCircle2} label="Проанализировано" value={String(totals?.done ?? 0)} color="var(--success)" large={tv} />
          <Kpi icon={Clock} label="В обработке" value={String(totals?.in_progress ?? 0)} color="var(--primary)" large={tv} />
          <Kpi icon={FileX} label="Без записи" value={String(totals?.no_recording ?? 0)} color="var(--warning)" large={tv} />
          <Kpi icon={AlertTriangle} label="Ошибки" value={String(totals?.failed ?? 0)} color="var(--destructive)" large={tv} />
        </div>

        <div className="kpi-grid-4" style={{
          display: "grid",
          gridTemplateColumns: tv ? "repeat(4, 1fr)" : "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12, marginBottom: 24,
        }}>
          <Kpi icon={Star} label="Средняя оценка" value={aggs?.avg_score != null ? `${aggs.avg_score.toFixed(1)} / 10` : "—"} color="var(--warning)" large={tv} />
          <Kpi icon={ClipboardList} label="Чек-лист" value={aggs?.avg_compliance != null ? `${Math.round(aggs.avg_compliance * 100)}%` : "—"} color="var(--primary)" large={tv} />
          <Kpi icon={Timer} label="Длительность" value={formatDuration(totals?.avg_duration ?? 0)} large={tv} />
          <Kpi icon={ArrowDownLeft} label="Вход / Исх" value={`${totals?.incoming ?? 0} / ${totals?.outgoing ?? 0}`} large={tv} />
        </div>

        <div className="ds-card" style={{ overflow: "hidden", padding: 0 }}>
          <div style={{ padding: tv ? "16px 24px" : "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ margin: 0, fontSize: tv ? 24 : 16, fontWeight: 600 }}>Менеджеры · {managers.length}</h2>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize }}>
              <thead style={{ background: "var(--muted)" }}>
                <tr>
                  <th style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "left" }}>ФИО</th>
                  <th style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>Звонков</th>
                  <th style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>Контактов</th>
                  <th style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>Минут</th>
                  <th style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>Ср. оценка</th>
                  <th style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>Чек-лист</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => (
                  <tr key={m.manager_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: tv ? "14px 16px" : "10px 12px", fontWeight: 500 }}>{m.manager_name}</td>
                    <td style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>{m.calls}</td>
                    <td style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right", color: "var(--success)", fontWeight: 600 }}>{m.connected}</td>
                    <td style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>{Math.round((m.total_seconds || 0) / 60)} мин</td>
                    <td style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right",
                      color: (m.avg_score ?? 0) >= 7 ? "var(--success)" : (m.avg_score ?? 0) >= 5 ? "var(--warning)" : "var(--destructive)",
                      fontWeight: 600,
                    }}>
                      {m.avg_score != null ? m.avg_score.toFixed(1) : "—"}
                    </td>
                    <td style={{ padding: tv ? "14px 16px" : "10px 12px", textAlign: "right" }}>
                      {m.avg_compliance != null ? `${Math.round(m.avg_compliance * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, color: "var(--muted-foreground)", fontSize: 11 }}>
          Call-Agent · публичный read-only режим
        </div>
      </div>
    </>
  );
}

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  if (s === 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
