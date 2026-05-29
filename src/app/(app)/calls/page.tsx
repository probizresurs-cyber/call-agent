import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { getDb } from "@/lib/db";
import { SentimentBadge, StatusBadge } from "@/app/_components/Badges";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  bitrix_call_id: string | null;
  manager_name: string | null;
  manager_id: string | null;
  client_phone: string | null;
  direction: "in" | "out" | null;
  started_at: string | null;
  duration_sec: number;
  status: string;
  summary: string | null;
  sentiment: string | null;
  manager_score: number | null;
};

export default async function CallsListPage(props: {
  searchParams: Promise<{ status?: string; sentiment?: string; q?: string }>;
}) {
  const sp = await props.searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.status) { where.push("c.status = ?"); params.push(sp.status); }
  if (sp.sentiment) { where.push("a.sentiment = ?"); params.push(sp.sentiment); }
  if (sp.q) {
    where.push(`c.id IN (SELECT call_id FROM transcripts WHERE text LIKE ?)`);
    params.push(`%${sp.q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = getDb()
    .prepare(
      `SELECT c.id, c.bitrix_call_id, c.manager_name, c.manager_id, c.client_phone,
              c.direction, c.started_at, c.duration_sec, c.status,
              a.summary, a.sentiment, a.manager_score
       FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
       ${whereSql}
       ORDER BY c.id DESC LIMIT 100`
    )
    .all(...params) as Row[];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 className="ds-h1">Звонки</h1>
        <form method="get" style={{ display: "flex", gap: 8 }}>
          <input
            className="ds-input"
            name="q"
            placeholder="Поиск по транскрипту…"
            defaultValue={sp.q || ""}
            style={{ width: 280 }}
          />
          <select className="ds-input" name="sentiment" defaultValue={sp.sentiment || ""} style={{ width: 160 }}>
            <option value="">Все настроения</option>
            <option value="positive">Позитив</option>
            <option value="neutral">Нейтрально</option>
            <option value="negative">Негатив</option>
          </select>
          <select className="ds-input" name="status" defaultValue={sp.status || ""} style={{ width: 160 }}>
            <option value="">Все статусы</option>
            <option value="done">Готово</option>
            <option value="pending">В очереди</option>
            <option value="failed">Ошибка</option>
          </select>
          <button className="ds-btn ds-btn-primary" type="submit">Применить</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="ds-card" style={{ textAlign: "center", padding: 40 }}>
          <div className="ds-body" style={{ color: "var(--muted-foreground)" }}>
            Пока нет звонков. Импортируйте звонки из истории →
            <Link href="/settings" style={{ color: "var(--primary)", marginLeft: 4 }}>Настройки</Link>
          </div>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>#</th><th>Дата</th><th>Менеджер</th><th>Клиент</th>
                <th>Дл.</th><th>Настр.</th><th>Оценка</th><th>Итог</th><th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/calls/${r.id}`} style={{ color: "var(--primary)" }}>#{r.id}</Link></td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.started_at)}</td>
                  <td>{r.manager_name || (r.manager_id ? `ID ${r.manager_id}` : "—")}</td>
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
                  <td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.summary || "—"}
                  </td>
                  <td><StatusBadge value={r.status} /></td>
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
  try { return new Date(s.replace(" ", "T")).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }); }
  catch { return s; }
}
function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
