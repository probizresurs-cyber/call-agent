/**
 * §5.5 + §9 MASTER-TZ — журнал CRM-write операций.
 *
 * Показывает что и куда было отправлено (или симулировано в DRY_RUN).
 * Это «бумажный след» — у заказчика и у нас всегда есть доказательство.
 *
 * Доступ: owner / admin / head.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Upload, CheckCircle2, XCircle, AlertCircle, Eye, Filter } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { listCrmLog, type CrmLogEntry } from "@/lib/crm-log";

export const dynamic = "force-dynamic";

export default async function CrmLogPage(props: { searchParams: Promise<{ mode?: "dry" | "live" }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role === "manager") redirect("/dashboard");

  const sp = await props.searchParams;
  const mode = sp.mode;
  const rows = await listCrmLog({ tenantId: me.tenantId, limit: 200, mode });

  const stats = {
    total: rows.length,
    sent: rows.filter((r) => r.status === "sent").length,
    dry: rows.filter((r) => r.mode === "dry").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 className="ds-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Upload size={22} strokeWidth={2} /> Журнал CRM-write
        </h1>
        <div style={{ display: "flex", gap: 6 }}>
          <FilterPill href="/crm-log" active={!mode} label={`Все (${stats.total})`} />
          <FilterPill href="/crm-log?mode=dry" active={mode === "dry"} label={`Симуляция (${stats.dry})`} />
          <FilterPill href="/crm-log?mode=live" active={mode === "live"} label={`Отправлено (${stats.sent})`} />
        </div>
      </div>

      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 20 }}>
        Каждое «Отправить в Bitrix» по звонку пишет сюда строку — что бы / что было отправлено.
        Помогает доказать перед заказчиком «мы отправили то и тогда», а также не дублировать те же
        комментарии при повторных попытках. <b>Симуляция</b> = DRY_RUN включён, в Bitrix реально ничего
        не уходит (см. <Link href="/call-agent/settings" style={{ color: "var(--primary)" }}>Настройки → Системные флаги</Link>).
      </p>

      {rows.length === 0 ? (
        <div className="ds-card" style={{ textAlign: "center", padding: 40 }}>
          <AlertCircle size={32} strokeWidth={1.5} color="var(--muted-foreground)" style={{ marginBottom: 10 }} />
          <div className="ds-body" style={{ color: "var(--muted-foreground)" }}>
            Записей нет. Откройте карточку любого звонка и нажмите «Отправить в Bitrix» —
            появится запись (в DRY-режиме без реальной отправки).
          </div>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Когда</th>
                <th style={{ width: 70 }}>Звонок</th>
                <th style={{ width: 160 }}>Действие</th>
                <th style={{ width: 120 }}>Цель</th>
                <th style={{ width: 100 }}>Режим</th>
                <th style={{ width: 110 }}>Статус</th>
                <th>Превью</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <Row key={r.id} r={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className="ds-button" style={{
      background: active ? "var(--primary)" : "transparent",
      color: active ? "white" : "var(--foreground)",
      border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
      fontSize: 12, textDecoration: "none",
    }}>
      <Filter size={11} strokeWidth={2} style={{ verticalAlign: -1, marginRight: 4 }} />
      {label}
    </Link>
  );
}

function Row({ r }: { r: CrmLogEntry }) {
  const actionLabel =
    r.action === "comment" ? "Комментарий в Timeline" :
    r.action === "activity_update" ? "Описание активности" :
    r.action === "task" ? "Задача" : r.action;
  const target = r.entity_type && r.entity_id ? `${r.entity_type} #${r.entity_id}` : "—";

  const statusColor =
    r.status === "sent" ? "var(--success)" :
    r.status === "failed" ? "var(--destructive)" :
    r.status === "skipped_dry" ? "var(--warning)" : "var(--muted-foreground)";

  const StatusIcon = r.status === "sent" ? CheckCircle2 : r.status === "failed" ? XCircle : AlertCircle;

  return (
    <tr>
      <td style={{ whiteSpace: "nowrap", fontSize: 11, color: "var(--muted-foreground)" }}>
        {formatDateTime(r.created_at)}
      </td>
      <td>
        <Link href={`/call-agent/calls/${r.call_id}`} style={{ color: "var(--primary)", fontWeight: 500 }}>
          #{r.call_id}
        </Link>
      </td>
      <td style={{ fontSize: 13 }}>{actionLabel}</td>
      <td style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{target}</td>
      <td>
        <span className="ds-badge" style={{
          background: r.mode === "live" ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)",
          color: r.mode === "live" ? "var(--success)" : "var(--warning)",
        }}>
          {r.mode === "live" ? "LIVE" : "DRY"}
        </span>
      </td>
      <td>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: statusColor, fontSize: 12, fontWeight: 600 }}>
          <StatusIcon size={12} strokeWidth={2} />
          {labelForStatus(r.status)}
        </span>
      </td>
      <td>
        <details>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--muted-foreground)" }}>
            <Eye size={11} strokeWidth={2} style={{ verticalAlign: -1, marginRight: 3 }} />
            JSON
          </summary>
          <pre style={{
            marginTop: 6, padding: 8, background: "var(--background)",
            border: "1px solid var(--border)", borderRadius: 4,
            fontSize: 10, overflow: "auto", maxHeight: 200,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {r.payload_json}
            {r.result_json ? "\n\n--- result ---\n" + r.result_json : ""}
          </pre>
        </details>
      </td>
    </tr>
  );
}

function labelForStatus(s: string): string {
  if (s === "sent") return "Отправлено";
  if (s === "failed") return "Ошибка";
  if (s === "skipped_dry") return "Симуляция";
  if (s === "skipped_duplicate") return "Дубль";
  return s;
}

function formatDateTime(s: string | null): string {
  if (!s) return "—";
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}
