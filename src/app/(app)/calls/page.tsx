import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Phone, MessageSquare, Mail, Video } from "lucide-react";
import { SummaryCell } from "./SummaryCell";
import { getDbAsync } from "@/lib/db-compat";
import { getSessionUser } from "@/lib/auth";
import { rlsFor } from "@/lib/rls";
import { SentimentBadge, StatusBadge } from "@/app/_components/Badges";
import { CallsFilters } from "./CallsFilters";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  bitrix_call_id: string | null;
  interaction_type: "call" | "chat" | "email" | "meeting" | null;
  channel: string | null;
  manager_name: string | null;
  manager_id: string | null;
  client_phone: string | null;
  direction: "in" | "out" | null;
  started_at: string | null;
  duration_sec: number;
  status: string;
  summary: string | null;
  next_action: string | null;
  sentiment: string | null;
  manager_score: number | null;
};

function TypeIcon({ type }: { type: string | null }) {
  const t = type || "call";
  if (t === "chat")    return <MessageSquare size={14} strokeWidth={2} color="var(--success)" />;
  if (t === "email")   return <Mail size={14} strokeWidth={2} color="var(--primary)" />;
  if (t === "meeting") return <Video size={14} strokeWidth={2} color="var(--warning)" />;
  return <Phone size={14} strokeWidth={2} color="var(--muted-foreground)" />;
}

export default async function CallsListPage(props: {
  searchParams: Promise<{ status?: string; sentiment?: string; q?: string; from?: string; to?: string; type?: string; manager_id?: string; min_duration?: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const isManager = me.role === "manager";
  const sp = await props.searchParams;

  // RLS: tenant + (для manager) фильтр по своему bitrix_manager_id
  const rls = rlsFor(me, { table: "c" });
  const where: string[] = [rls.sql];
  const params: unknown[] = [...rls.params];

  if (sp.status) { where.push("c.status = ?"); params.push(sp.status); }
  if (sp.type)   { where.push("c.interaction_type = ?"); params.push(sp.type); }
  if (sp.sentiment) { where.push("a.sentiment = ?"); params.push(sp.sentiment); }
  // Фильтр по менеджеру — только для не-manager ролей (у manager RLS уже жёсткая)
  if (!isManager && sp.manager_id) { where.push("c.manager_id = ?"); params.push(sp.manager_id); }
  if (sp.q) {
    where.push(`c.id IN (SELECT call_id FROM transcripts WHERE text LIKE ?)`);
    params.push(`%${sp.q}%`);
  }
  if (sp.from) { where.push("substr(c.started_at,1,10) >= ?"); params.push(sp.from); }
  if (sp.to)   { where.push("substr(c.started_at,1,10) <= ?"); params.push(sp.to); }
  if (sp.min_duration) {
    const minDur = parseInt(sp.min_duration, 10);
    if (Number.isFinite(minDur) && minDur > 0) {
      where.push("c.duration_sec >= ?");
      params.push(minDur);
    }
  }
  // Скрытые менеджеры не показываются (фильтр настраивается в /settings)
  // Применяется только для head/admin/owner — у manager и так свой ID жёстко
  if (!isManager) {
    where.push("(c.manager_id IS NULL OR c.manager_id NOT IN (SELECT id FROM managers WHERE is_active = 0))");
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  // Список менеджеров для фильтра (только для head/admin/owner)
  const managersList = isManager ? [] : await getDbAsync()
    .prepare(
      `SELECT c.manager_id AS id,
              COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name
       FROM calls c
       LEFT JOIN managers m ON m.id = c.manager_id
       WHERE c.tenant_id = ?
         AND c.manager_id IS NOT NULL AND c.manager_id != ''
         AND (m.is_active IS NULL OR m.is_active = 1)
       GROUP BY c.manager_id
       ORDER BY name`
    )
    .all<{ id: string; name: string }>(me.tenantId);

  const rows = await getDbAsync()
    .prepare(
      `SELECT c.id, c.bitrix_call_id, c.interaction_type, c.channel,
              c.manager_name, c.manager_id, c.client_phone,
              c.direction, c.started_at, c.duration_sec, c.status,
              a.summary, a.next_action, a.sentiment, a.manager_score
       FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
       ${whereSql}
       ORDER BY c.id DESC LIMIT 200`
    )
    .all<Row>(...params);

  const totalCount = (await getDbAsync()
    .prepare(`SELECT COUNT(*) AS n FROM calls c LEFT JOIN analyses a ON a.call_id = c.id ${whereSql}`)
    .get<{ n: number }>(...params))!;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 className="ds-h1">{isManager ? "Мои звонки" : "Звонки"}</h1>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
          Найдено: <b>{totalCount.n}</b>{rows.length < totalCount.n ? ` (показано первые ${rows.length})` : ""}
        </div>
      </div>

      <CallsFilters managers={isManager ? undefined : managersList} />

      {rows.length === 0 ? (
        <div className="ds-card" style={{ textAlign: "center", padding: 40 }}>
          <div className="ds-body" style={{ color: "var(--muted-foreground)" }}>
            Нет звонков под текущие фильтры. Попробуйте сбросить фильтры или импортировать ещё →
            <Link href="/settings" style={{ color: "var(--primary)", marginLeft: 4 }}>Настройки</Link>
          </div>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>#</th><th>Дата</th><th>Менеджер</th><th>Заказчик</th>
                <th>Дл.</th><th>Настр.</th><th>Оценка</th>
                <th style={{ minWidth: 360 }}>Итог</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ textAlign: "center" }} title={r.interaction_type || "call"}>
                    <TypeIcon type={r.interaction_type} />
                  </td>
                  <td><Link href={`/calls/${r.id}`} style={{ color: "var(--primary)" }}>#{r.id}</Link></td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.started_at)}</td>
                  <td>{r.manager_name || (r.manager_id ? <span style={{ color: "var(--muted-foreground)" }}>ID {r.manager_id}</span> : "—")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {r.direction === "in"
                        ? <ArrowDownLeft size={14} strokeWidth={2} color="var(--success)" />
                        : r.direction === "out"
                        ? <ArrowUpRight size={14} strokeWidth={2} color="var(--primary)" />
                        : null}
                      {r.client_phone || "—"}
                    </span>
                  </td>
                  <td>{formatDuration(r.duration_sec)}</td>
                  <td><SentimentBadge value={r.sentiment} /></td>
                  <td>{r.manager_score != null ? r.manager_score.toFixed(1) : "—"}</td>
                  <td style={{
                    minWidth: 360, maxWidth: 360,
                    verticalAlign: "top", padding: "8px",
                  }}>
                    <SummaryCell summary={r.summary} nextAction={r.next_action} />
                  </td>
                  <td style={{ verticalAlign: "top", paddingTop: 10 }}><StatusBadge value={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  // SQLite даёт "2026-06-02 12:34:56", PG — "2026-06-02 12:34:56+00" или с миллисекундами.
  // JS Date не парсит "+00" без двоеточия — нормализуем в "+00:00".
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}
function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
