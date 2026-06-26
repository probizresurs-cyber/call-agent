import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Scale, AlertCircle, CheckCircle2, XCircle, ExternalLink, Filter } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { DiscrepanciesFilters } from "./DiscrepanciesFilters";
import { ResolveButtons } from "./ResolveButtons";
import { DiscrepancyDetail } from "./DiscrepancyDetail";
import type { DiscrepancySeverity, DiscrepancyStatus } from "@/lib/discrepancy-types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type DiscrepancyRow = {
  id: number;
  call_id: number;
  entity_type: string | null;
  entity_id: string | null;
  field_name: string;
  field_label: string | null;
  card_value: string | null;
  suggested_value: string | null;
  transcript_evidence: string | null;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
  routed_to_user_id: number | null;
  created_at: string;
  resolved_at: string | null;
  // from JOIN
  started_at: string | null;
  manager_name: string | null;
  manager_id: string | null;
  bitrix_portal_url: string | null;
  routed_to_name: string | null;
  // action_mode from tenant settings
  action_mode: string | null;
};

type KpiRow = {
  pending: number;
  accepted: number;
  rejected: number;
  auto_applied: number;
};

type ManagerOption = {
  id: string;
  name: string;
};

function SeverityBadge({ value }: { value: DiscrepancySeverity }) {
  if (value === "high")
    return (
      <span
        className="ds-badge ds-badge-danger"
        style={{ paddingLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <AlertCircle size={11} strokeWidth={2.5} />
        Высокий
      </span>
    );
  if (value === "medium")
    return (
      <span
        className="ds-badge"
        style={{
          paddingLeft: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "color-mix(in oklch, #ea580c 15%, var(--card))",
          color: "#ea580c",
          borderColor: "color-mix(in oklch, #ea580c 30%, var(--border))",
        }}
      >
        <AlertCircle size={11} strokeWidth={2.5} />
        Средний
      </span>
    );
  return (
    <span
      className="ds-badge ds-badge-warning"
      style={{ paddingLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      Низкий
    </span>
  );
}

function StatusBadge({ value }: { value: DiscrepancyStatus }) {
  if (value === "pending")
    return (
      <span
        className="ds-badge ds-badge-info"
        style={{ paddingLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <AlertCircle size={11} strokeWidth={2.5} />
        Ожидает
      </span>
    );
  if (value === "accepted")
    return (
      <span
        className="ds-badge ds-badge-success"
        style={{ paddingLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <CheckCircle2 size={11} strokeWidth={2.5} />
        Принято
      </span>
    );
  if (value === "rejected")
    return (
      <span
        className="ds-badge"
        style={{
          paddingLeft: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "var(--muted)",
          color: "var(--muted-foreground)",
        }}
      >
        <XCircle size={11} strokeWidth={2.5} />
        Отклонено
      </span>
    );
  if (value === "auto_applied")
    return (
      <span
        className="ds-badge ds-badge-success"
        style={{ paddingLeft: 6, display: "inline-flex", alignItems: "center", gap: 4, fontStyle: "italic" }}
      >
        <CheckCircle2 size={11} strokeWidth={2.5} />
        Авто-применено
      </span>
    );
  if (value === "manual_fixed")
    return (
      <span
        className="ds-badge ds-badge-success"
        style={{ paddingLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <CheckCircle2 size={11} strokeWidth={2.5} />
        Исправлено вручную
      </span>
    );
  return <span className="ds-badge">{value}</span>;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function truncate(s: string | null, max = 60): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default async function DiscrepanciesPage(props: {
  searchParams: Promise<{
    status?: string;
    manager_id?: string;
    severity?: string;
    page?: string;
  }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  // Only owner / admin / head may access this page
  if (me.role === "manager") redirect("/my");

  const sp = await props.searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDbAsync();

  // ── Build WHERE ──────────────────────────────────────────────
  const where: string[] = ["cd.tenant_id = ?"];
  const params: unknown[] = [me.tenantId];

  if (sp.status) {
    where.push("cd.status = ?");
    params.push(sp.status);
  }
  if (sp.manager_id) {
    where.push("c.manager_id = ?");
    params.push(sp.manager_id);
  }
  if (sp.severity) {
    where.push("cd.severity = ?");
    params.push(sp.severity);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  // ── KPI counts (always full-tenant, no filters) ───────────────
  const kpiRow = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN cd.status = 'pending'      THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN cd.status = 'accepted'     THEN 1 ELSE 0 END) AS accepted,
         SUM(CASE WHEN cd.status = 'rejected'     THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN cd.status = 'auto_applied' THEN 1 ELSE 0 END) AS auto_applied
       FROM card_discrepancies cd
       WHERE cd.tenant_id = ?`
    )
    .get<KpiRow>(me.tenantId);

  const kpi: KpiRow = kpiRow ?? { pending: 0, accepted: 0, rejected: 0, auto_applied: 0 };

  // ── Data rows ─────────────────────────────────────────────────
  const rows = await db
    .prepare(
      `SELECT cd.id, cd.call_id, cd.entity_type, cd.entity_id,
              cd.field_name, cd.field_label, cd.card_value, cd.suggested_value,
              cd.transcript_evidence, cd.severity, cd.status,
              cd.routed_to_user_id, cd.created_at, cd.resolved_at,
              c.started_at, c.manager_name, c.manager_id, c.bitrix_portal_url,
              u.name AS routed_to_name
       FROM card_discrepancies cd
       JOIN calls c ON c.id = cd.call_id
       LEFT JOIN users u ON u.id = cd.routed_to_user_id
       ${whereSql}
       ORDER BY cd.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all<DiscrepancyRow>(...params, PAGE_SIZE, offset);

  // ── Total count for pagination ─────────────────────────────────
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM card_discrepancies cd
       JOIN calls c ON c.id = cd.call_id
       ${whereSql}`
    )
    .get<{ n: number }>(...params);
  const total = countRow?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Managers list for filter ───────────────────────────────────
  const managers = await db
    .prepare(
      `SELECT DISTINCT c.manager_id AS id,
              COALESCE(MAX(c.manager_name), '') AS name
       FROM card_discrepancies cd
       JOIN calls c ON c.id = cd.call_id
       WHERE cd.tenant_id = ?
         AND c.manager_id IS NOT NULL AND c.manager_id != ''
       GROUP BY c.manager_id
       ORDER BY name`
    )
    .all<ManagerOption>(me.tenantId);

  // ── Tenant action_mode ────────────────────────────────────────
  const tenantRow = await db
    .prepare(`SELECT discrepancy_action_mode FROM tenants WHERE id = ? LIMIT 1`)
    .get<{ discrepancy_action_mode: string | null }>(me.tenantId);
  const actionMode = tenantRow?.discrepancy_action_mode ?? "manual";

  // ── Pagination helper ─────────────────────────────────────────
  function buildPageUrl(p: number) {
    const q = new URLSearchParams();
    if (sp.status) q.set("status", sp.status);
    if (sp.manager_id) q.set("manager_id", sp.manager_id);
    if (sp.severity) q.set("severity", sp.severity);
    q.set("page", String(p));
    return `/discrepancies?${q.toString()}`;
  }

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1
          className="ds-h1"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <Scale size={22} strokeWidth={2} color="var(--primary)" />
          Расхождения с CRM
        </h1>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
          Найдено: <b>{total}</b>
          {rows.length < total
            ? ` (показаны ${offset + 1}–${Math.min(offset + rows.length, total)})`
            : ""}
        </div>
      </div>

      {/* KPI tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <KpiTile
          label="Ожидают"
          value={kpi.pending}
          color="var(--primary)"
          icon={<AlertCircle size={16} strokeWidth={2} />}
        />
        <KpiTile
          label="Принято"
          value={kpi.accepted}
          color="var(--success)"
          icon={<CheckCircle2 size={16} strokeWidth={2} />}
        />
        <KpiTile
          label="Отклонено"
          value={kpi.rejected}
          color="var(--muted-foreground)"
          icon={<XCircle size={16} strokeWidth={2} />}
        />
        <KpiTile
          label="Авто-применено"
          value={kpi.auto_applied}
          color="var(--success)"
          icon={<CheckCircle2 size={16} strokeWidth={2} />}
          italic
        />
      </div>

      {/* Filters */}
      <DiscrepanciesFilters managers={managers} />

      {/* Table */}
      {rows.length === 0 ? (
        <div
          className="ds-card"
          style={{ textAlign: "center", padding: 48 }}
        >
          <Filter
            size={32}
            strokeWidth={1.5}
            style={{ color: "var(--muted-foreground)", marginBottom: 12 }}
          />
          <div className="ds-body" style={{ color: "var(--muted-foreground)" }}>
            Нет расхождений под текущие фильтры.
          </div>
        </div>
      ) : (
        <div
          className="ds-card"
          style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}
        >
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ whiteSpace: "nowrap" }}>Дата звонка</th>
                <th>Менеджер</th>
                <th>Поле</th>
                <th style={{ minWidth: 180 }}>Текущее → Предлагается</th>
                <th>Важность</th>
                <th>Статус</th>
                <th style={{ width: 160 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <React.Fragment key={r.id}>
                <tr>
                  {/* Date + link to call */}
                  <td style={{ whiteSpace: "nowrap", verticalAlign: "top", paddingTop: 10 }}>
                    <Link
                      href={`/calls/${r.call_id}`}
                      style={{
                        color: "var(--primary)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title={`Открыть звонок #${r.call_id}`}
                    >
                      <ExternalLink size={12} strokeWidth={2} />
                      {formatDate(r.started_at)}
                    </Link>
                  </td>

                  {/* Manager */}
                  <td style={{ verticalAlign: "top", paddingTop: 10 }}>
                    {r.manager_name || (
                      r.manager_id ? (
                        <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                          ID {r.manager_id}
                        </span>
                      ) : (
                        "—"
                      )
                    )}
                  </td>

                  {/* Field */}
                  <td style={{ verticalAlign: "top", paddingTop: 10 }}>
                    <span
                      style={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "var(--muted-foreground)",
                        display: "block",
                      }}
                    >
                      {r.field_label || r.field_name}
                    </span>
                    {r.transcript_evidence && (
                      <span
                        style={{
                          display: "block",
                          fontSize: 11,
                          color: "var(--muted-foreground)",
                          marginTop: 2,
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={r.transcript_evidence}
                      >
                        &ldquo;{truncate(r.transcript_evidence, 50)}&rdquo;
                      </span>
                    )}
                  </td>

                  {/* Values diff */}
                  <td style={{ verticalAlign: "top", paddingTop: 10, minWidth: 180 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--muted-foreground)",
                          textDecoration: "line-through",
                        }}
                        title={r.card_value ?? undefined}
                      >
                        {truncate(r.card_value, 40)}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--foreground)",
                        }}
                        title={r.suggested_value ?? undefined}
                      >
                        {truncate(r.suggested_value, 40)}
                      </span>
                    </div>
                  </td>

                  {/* Severity */}
                  <td style={{ verticalAlign: "top", paddingTop: 8 }}>
                    <SeverityBadge value={r.severity} />
                  </td>

                  {/* Status */}
                  <td style={{ verticalAlign: "top", paddingTop: 8 }}>
                    <StatusBadge value={r.status} />
                  </td>

                  {/* Actions */}
                  <td style={{ verticalAlign: "top", paddingTop: 6 }}>
                    <ResolveButtons
                      discrepancyId={r.id}
                      currentStatus={r.status}
                      actionMode={actionMode}
                    />
                  </td>
                </tr>

                {/* ЗАДАЧА B: раскрывающаяся строка детального просмотра */}
                <tr>
                  <td colSpan={7} style={{ padding: "0 12px 8px" }}>
                    <DiscrepancyDetail
                      data={{
                        id: r.id,
                        call_id: r.call_id,
                        entity_type: r.entity_type,
                        entity_id: r.entity_id,
                        field_name: r.field_name,
                        field_label: r.field_label,
                        card_value: r.card_value,
                        suggested_value: r.suggested_value,
                        transcript_evidence: r.transcript_evidence,
                        severity: r.severity,
                        status: r.status,
                        created_at: r.created_at,
                        started_at: r.started_at,
                        manager_name: r.manager_name,
                        manager_id: r.manager_id,
                        bitrix_portal_url: r.bitrix_portal_url,
                        actionMode,
                      }}
                    />
                  </td>
                </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {page > 1 && (
            <Link className="ds-btn ds-btn-secondary" href={buildPageUrl(page - 1)}>
              ← Назад
            </Link>
          )}
          <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            Стр. {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link className="ds-btn ds-btn-secondary" href={buildPageUrl(page + 1)}>
              Вперёд →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

// ── KPI tile sub-component ────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  color,
  icon,
  italic,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
  italic?: boolean;
}) {
  return (
    <div
      className="ds-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color,
          fontSize: 12,
          fontWeight: 600,
          fontStyle: italic ? "italic" : undefined,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1,
          color,
        }}
      >
        {value ?? 0}
      </div>
    </div>
  );
}
