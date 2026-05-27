import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status IN ('pending','downloading','transcribing','analyzing','syncing') THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM calls`
    )
    .get() as { total: number; done: number; in_progress: number; failed: number };

  const sentiments = db
    .prepare(`SELECT sentiment, COUNT(*) AS n FROM analyses GROUP BY sentiment`)
    .all() as Array<{ sentiment: string; n: number }>;

  const avgScore = db
    .prepare(`SELECT AVG(manager_score) AS avg FROM analyses`)
    .get() as { avg: number | null };

  const topManagers = db
    .prepare(
      `SELECT c.manager_id, c.manager_name,
              COUNT(*) AS calls,
              AVG(a.manager_score) AS avg_score
       FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.manager_id IS NOT NULL
       GROUP BY c.manager_id
       ORDER BY calls DESC LIMIT 10`
    )
    .all() as Array<{ manager_id: string; manager_name: string | null; calls: number; avg_score: number | null }>;

  const sentMap = Object.fromEntries(sentiments.map((s) => [s.sentiment ?? "unknown", s.n]));
  const sentTotal = sentiments.reduce((a, s) => a + s.n, 0);

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 24 }}>Дашборд</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>
        <Stat label="Всего звонков" value={totals.total} />
        <Stat label="Проанализировано" value={totals.done} accent="success" />
        <Stat label="В обработке" value={totals.in_progress} accent="info" />
        <Stat label="Ошибки" value={totals.failed} accent="danger" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 14 }}>Настроение клиентов</h2>
          {sentTotal === 0 ? (
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>Нет данных</div>
          ) : (
            <>
              <SentimentBar parts={[
                { label: "Позитив", value: sentMap.positive || 0, color: "#1f9d55" },
                { label: "Нейтрально", value: sentMap.neutral || 0, color: "#a0a0a0" },
                { label: "Негатив", value: sentMap.negative || 0, color: "#d44343" },
              ]} />
            </>
          )}
        </div>

        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 14 }}>Средняя оценка менеджеров</h2>
          <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1 }}>
            {avgScore.avg != null ? avgScore.avg.toFixed(1) : "—"}
            <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginLeft: 6 }}>/ 10</span>
          </div>
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 8 }}>
            Считается из анализа Claude по всем разговорам
          </div>
        </div>
      </div>

      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 14 }}>Топ менеджеров</h2>
        {topManagers.length === 0 ? (
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>Пока звонков нет</div>
        ) : (
          <table className="ds-table">
            <thead><tr><th>Менеджер</th><th>Звонков</th><th>Средняя оценка</th></tr></thead>
            <tbody>
              {topManagers.map((m) => (
                <tr key={m.manager_id}>
                  <td>{m.manager_name || `ID ${m.manager_id}`}</td>
                  <td>{m.calls}</td>
                  <td>{m.avg_score != null ? m.avg_score.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "success" | "info" | "danger" }) {
  const color =
    accent === "success" ? "var(--success)" :
    accent === "info" ? "var(--primary)" :
    accent === "danger" ? "var(--destructive)" :
    "var(--foreground)";
  return (
    <div className="ds-card">
      <div className="ds-caption">{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6, color }}>{value}</div>
    </div>
  );
}

function SentimentBar({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: "var(--muted)" }}>
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {parts.map((p) => (
          <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: "inline-block" }} />
            <span style={{ color: "var(--muted-foreground)" }}>{p.label}</span>
            <b>{p.value}</b>
          </div>
        ))}
      </div>
    </>
  );
}
