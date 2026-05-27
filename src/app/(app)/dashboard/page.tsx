import {
  Phone, CheckCircle2, XCircle, CircleDot, Clock, AlertTriangle,
  Star, ClipboardList, MessageSquare, Tag, Timer, ArrowDownLeft, ArrowUpRight,
  TrendingUp, AlertOctagon, Users, type LucideIcon,
} from "lucide-react";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type SentimentBucket = "positive" | "neutral" | "negative" | "unknown";

interface DailyRow {
  day: string;
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

export default async function DashboardPage() {
  const db = getDb();

  // ───────────── KPI карточки ─────────────
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status IN ('pending','downloading','transcribing','analyzing','syncing') THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN direction='in' THEN 1 ELSE 0 END) AS incoming,
         SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END) AS outgoing,
         COALESCE(AVG(duration_sec), 0) AS avg_duration,
         COALESCE(SUM(duration_sec), 0) AS total_duration
       FROM calls`
    )
    .get() as {
      total: number; done: number; in_progress: number; failed: number;
      incoming: number; outgoing: number;
      avg_duration: number; total_duration: number;
    };

  const aggs = db
    .prepare(`SELECT AVG(manager_score) AS avg_score, AVG(script_compliance) AS avg_compliance FROM analyses`)
    .get() as { avg_score: number | null; avg_compliance: number | null };

  // ───────────── Sentiment ─────────────
  const sentiments = db
    .prepare(`SELECT sentiment, COUNT(*) AS n FROM analyses GROUP BY sentiment`)
    .all() as Array<{ sentiment: string; n: number }>;
  const sentMap: Record<SentimentBucket, number> = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
  for (const s of sentiments) sentMap[(s.sentiment as SentimentBucket) || "unknown"] = s.n;
  const sentTotal = sentMap.positive + sentMap.neutral + sentMap.negative;

  // ───────────── Топ менеджеров ─────────────
  const topManagers = db
    .prepare(
      `SELECT c.manager_id, c.manager_name,
              COUNT(*) AS calls,
              AVG(a.manager_score) AS avg_score,
              AVG(a.script_compliance) AS avg_compliance,
              SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END) AS negatives
       FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.manager_id IS NOT NULL
       GROUP BY c.manager_id
       ORDER BY calls DESC LIMIT 10`
    )
    .all() as Array<{
      manager_id: string; manager_name: string | null;
      calls: number; avg_score: number | null; avg_compliance: number | null; negatives: number;
    }>;

  // ───────────── Динамика по дням (последние 14) ─────────────
  const daily = db
    .prepare(
      `SELECT
         substr(c.started_at, 1, 10) AS day,
         COUNT(*) AS total,
         SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END) AS positive,
         SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END) AS negative,
         SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END) AS neutral
       FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.started_at IS NOT NULL
         AND substr(c.started_at,1,10) >= date('now','-13 day')
       GROUP BY day ORDER BY day ASC`
    )
    .all() as DailyRow[];

  // Заполняем пропущенные дни нулями
  const series: DailyRow[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const row = daily.find((r) => r.day === ds);
    series.push(row ?? { day: ds, total: 0, positive: 0, negative: 0, neutral: 0 });
  }
  const maxDaily = Math.max(1, ...series.map((s) => s.total));

  // ───────────── Топ возражений + темы ─────────────
  const rawObj = db.prepare(`SELECT objections_json FROM analyses WHERE objections_json IS NOT NULL`).all() as Array<{ objections_json: string }>;
  const objCount = new Map<string, number>();
  for (const r of rawObj) {
    try {
      const arr = JSON.parse(r.objections_json) as string[];
      for (const o of arr || []) {
        const k = o.trim().toLowerCase();
        if (!k) continue;
        objCount.set(k, (objCount.get(k) || 0) + 1);
      }
    } catch {}
  }
  const topObjections = [...objCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([title, count]) => ({ title, count }));

  const rawTopics = db.prepare(`SELECT topics_json FROM analyses WHERE topics_json IS NOT NULL`).all() as Array<{ topics_json: string }>;
  const topicCount = new Map<string, number>();
  for (const r of rawTopics) {
    try {
      const arr = JSON.parse(r.topics_json) as string[];
      for (const t of arr || []) {
        const k = t.trim().toLowerCase();
        if (!k) continue;
        topicCount.set(k, (topicCount.get(k) || 0) + 1);
      }
    } catch {}
  }
  const topTopics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([title, count]) => ({ title, count }));

  // ───────────── Слабые пункты чек-листа ─────────────
  const rawChecklist = db
    .prepare(`SELECT checklist_scores_json FROM analyses WHERE checklist_scores_json IS NOT NULL`)
    .all() as Array<{ checklist_scores_json: string }>;
  const itemStats = new Map<string, { title: string; sum: number; n: number }>();
  for (const r of rawChecklist) {
    try {
      const arr = JSON.parse(r.checklist_scores_json) as Array<{ id: string; title: string; score: number }>;
      for (const it of arr || []) {
        const key = it.id || it.title;
        if (!key) continue;
        const cur = itemStats.get(key) ?? { title: it.title || key, sum: 0, n: 0 };
        cur.sum += it.score;
        cur.n += 1;
        itemStats.set(key, cur);
      }
    } catch {}
  }
  const checklistStats = [...itemStats.entries()]
    .map(([id, s]) => ({ id, title: s.title, avg: s.n ? s.sum / s.n : 0, n: s.n }))
    .sort((a, b) => a.avg - b.avg); // от слабых к сильным

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 24 }}>Дашборд</h1>

      {/* ───── KPI ───── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <Kpi icon={Phone} label="Всего звонков" value={String(totals.total)} />
        <Kpi icon={CheckCircle2} label="Проанализировано" value={String(totals.done)} color="var(--success)" />
        <Kpi icon={Clock} label="В обработке" value={String(totals.in_progress)} color="var(--primary)" />
        <Kpi icon={AlertTriangle} label="Ошибки" value={String(totals.failed)} color="var(--destructive)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        <Kpi
          icon={Star}
          label="Средняя оценка менеджера"
          value={aggs.avg_score != null ? `${aggs.avg_score.toFixed(1)} / 10` : "—"}
          color="var(--warning)"
        />
        <Kpi
          icon={ClipboardList}
          label="Среднее по чек-листу"
          value={aggs.avg_compliance != null ? `${Math.round(aggs.avg_compliance * 100)}%` : "—"}
          color="var(--primary)"
        />
        <Kpi
          icon={Timer}
          label="Средняя длительность"
          value={formatDuration(totals.avg_duration)}
        />
        <Kpi
          icon={ArrowDownLeft}
          label="Входящие / Исходящие"
          value={`${totals.incoming} / ${totals.outgoing}`}
        />
      </div>

      {/* ───── Динамика по дням ───── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={16} strokeWidth={2} /> Динамика за 14 дней
        </h2>
        {totals.total === 0 ? (
          <Empty />
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${series.length}, 1fr)`,
            gap: 6,
            alignItems: "end",
            height: 160,
          }}>
            {series.map((s) => {
              const tot = s.positive + s.negative + s.neutral || s.total;
              const hPx = Math.round((s.total / maxDaily) * 130) + 2;
              return (
                <div key={s.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    fontSize: 11, color: "var(--muted-foreground)",
                    visibility: s.total ? "visible" : "hidden",
                  }}>{s.total}</div>
                  <div style={{
                    width: "100%", height: hPx, borderRadius: 4,
                    display: "flex", flexDirection: "column",
                    overflow: "hidden",
                    background: "var(--muted)",
                  }}
                    title={`${s.day}: всего ${s.total}, +${s.positive} / ~${s.neutral} / -${s.negative}`}
                  >
                    {tot > 0 && (
                      <>
                        <div style={{ flex: s.positive, background: "var(--success)" }} />
                        <div style={{ flex: s.neutral, background: "var(--muted-foreground)", opacity: 0.55 }} />
                        <div style={{ flex: s.negative, background: "var(--destructive)" }} />
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>
                    {s.day.slice(8, 10)}.{s.day.slice(5, 7)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12 }}>
          <LegendDot color="var(--success)" label="Позитив" />
          <LegendDot color="var(--muted-foreground)" label="Нейтрально" />
          <LegendDot color="var(--destructive)" label="Негатив" />
        </div>
      </div>

      {/* ───── Sentiment + Слабые пункты чек-листа ───── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <CircleDot size={16} strokeWidth={2} /> Настроение клиентов
          </h2>
          {sentTotal === 0 ? <Empty /> : (
            <>
              <SentimentBar parts={[
                { label: "Позитив",   value: sentMap.positive, color: "var(--success)" },
                { label: "Нейтрально", value: sentMap.neutral, color: "var(--muted-foreground)" },
                { label: "Негатив",   value: sentMap.negative, color: "var(--destructive)" },
              ]} />
              <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted-foreground)" }}>
                <SentRow icon={<CheckCircle2 size={14} color="var(--success)" />} label="Позитивных" value={sentMap.positive} total={sentTotal} />
                <SentRow icon={<CircleDot size={14} />} label="Нейтральных" value={sentMap.neutral} total={sentTotal} />
                <SentRow icon={<XCircle size={14} color="var(--destructive)" />} label="Негативных" value={sentMap.negative} total={sentTotal} />
              </div>
            </>
          )}
        </div>

        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertOctagon size={16} strokeWidth={2} /> Слабые места в скрипте
          </h2>
          {checklistStats.length === 0 ? <Empty hint="Чек-лист ещё не оценивался" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checklistStats.slice(0, 6).map((c) => (
                <div key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{c.title}</span>
                    <span style={{ color: "var(--muted-foreground)" }}>
                      {Math.round(c.avg * 100)}% · {c.n} зв.
                    </span>
                  </div>
                  <Bar value={c.avg} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ───── Топ возражений + Топ тем ───── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={16} strokeWidth={2} /> Топ возражений
          </h2>
          {topObjections.length === 0 ? <Empty /> : (
            <TopList items={topObjections} max={Math.max(...topObjections.map((o) => o.count))} />
          )}
        </div>

        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Tag size={16} strokeWidth={2} /> Топ тем
          </h2>
          {topTopics.length === 0 ? <Empty /> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {topTopics.map((t) => (
                <span key={t.title} className="ds-badge ds-badge-info">
                  {t.title} <b style={{ marginLeft: 4 }}>{t.count}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ───── Топ менеджеров ───── */}
      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={16} strokeWidth={2} /> Менеджеры
        </h2>
        {topManagers.length === 0 ? <Empty /> : (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Менеджер</th>
                <th style={{ width: 90 }}>Звонков</th>
                <th style={{ width: 110 }}>Ср. оценка</th>
                <th style={{ width: 110 }}>Чек-лист</th>
                <th style={{ width: 110 }}>Негативных</th>
              </tr>
            </thead>
            <tbody>
              {topManagers.map((m) => (
                <tr key={m.manager_id}>
                  <td>{m.manager_name || `ID ${m.manager_id}`}</td>
                  <td>{m.calls}</td>
                  <td>
                    {m.avg_score != null ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Star size={12} color="var(--warning)" />
                        {m.avg_score.toFixed(1)}
                      </span>
                    ) : "—"}
                  </td>
                  <td>{m.avg_compliance != null ? `${Math.round(m.avg_compliance * 100)}%` : "—"}</td>
                  <td>
                    {m.negatives > 0 ? (
                      <span className="ds-badge ds-badge-danger">{m.negatives}</span>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)" }}>0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ──────────── Вспомогательные ──────────── */

function Kpi({ icon: Icon, label, value, color }: {
  icon: LucideIcon; label: string; value: string; color?: string;
}) {
  return (
    <div className="ds-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span className="ds-caption">{label}</span>
        <Icon size={16} strokeWidth={2} color={color || "var(--muted-foreground)"} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "var(--foreground)", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

function SentimentBar({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--muted)" }}>
      {parts.map((p) => (
        <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

function SentRow({ icon, label, value, total }: { icon: React.ReactNode; label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {icon} {label}
      </span>
      <span>{value} <span style={{ opacity: 0.6 }}>({pct}%)</span></span>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--destructive)";
  return (
    <div style={{ height: 6, background: "var(--muted)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}

function TopList({ items, max }: { items: Array<{ title: string; count: number }>; max: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((it) => (
        <div key={it.title} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13 }}>{capitalize(it.title)}</div>
          <div style={{ width: 120, height: 6, background: "var(--muted)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(it.count / max) * 100}%`, height: "100%", background: "var(--primary)" }} />
          </div>
          <div style={{ minWidth: 26, textAlign: "right", fontSize: 12, fontWeight: 600 }}>{it.count}</div>
        </div>
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
    </span>
  );
}

function Empty({ hint }: { hint?: string } = {}) {
  return (
    <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", padding: "20px 0", textAlign: "center" }}>
      {hint || "Пока данных нет"}
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
