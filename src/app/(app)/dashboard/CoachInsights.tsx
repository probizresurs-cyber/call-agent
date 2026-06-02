/**
 * §5.1-§5.2 MASTER-TZ: блок «Зоны роста» для менеджера в /dashboard.
 *
 * Берёт все анализы менеджера за последние 30 дней, парсит checklist_scores_json,
 * агрегирует по item.id (по title), считает средний балл, показывает 3 худших пункта.
 *
 * Также показывает 3 последних coaching_tips из недавних звонков —
 * чтобы у менеджера была «лента подсказок».
 *
 * Тон: доброжелательно. НЕ «вы плохо», а «обратите внимание на».
 */
import { TrendingDown, Lightbulb } from "lucide-react";
import { getDbAsync } from "@/lib/db-compat";
import type { SessionUser } from "@/lib/auth";

type ScoreItem = { id: string; title: string; score: number; notes?: string };
type ChecklistRow = { checklist_scores_json: string | null };
type TipRow = { call_id: number; coaching_tips_json: string | null };

interface ItemAggregate {
  title: string;
  avgScore: number;
  count: number;
}

export async function CoachInsights({ user }: { user: SessionUser }) {
  if (user.role !== "manager" || !user.bitrixManagerId) return null;

  const db = getDbAsync();

  // 1. Все checklist scores за последние 30 дней
  const scoreRows = await db
    .prepare(
      `SELECT a.checklist_scores_json
       FROM analyses a
       JOIN calls c ON c.id = a.call_id
       WHERE c.tenant_id = ?
         AND c.manager_id = ?
         AND a.checklist_scores_json IS NOT NULL
         AND substr(c.started_at, 1, 10) >= date('now', '-30 day')`
    )
    .all<ChecklistRow>(user.tenantId, user.bitrixManagerId);

  // Агрегация: title → { sumScore, count }
  const byTitle = new Map<string, { sum: number; n: number }>();
  for (const row of scoreRows) {
    let items: ScoreItem[];
    try { items = JSON.parse(row.checklist_scores_json || "[]"); } catch { continue; }
    for (const item of items) {
      if (!item.title || typeof item.score !== "number") continue;
      const cur = byTitle.get(item.title) ?? { sum: 0, n: 0 };
      cur.sum += item.score;
      cur.n += 1;
      byTitle.set(item.title, cur);
    }
  }

  const aggregates: ItemAggregate[] = Array.from(byTitle.entries())
    .map(([title, v]) => ({ title, avgScore: v.sum / v.n, count: v.n }))
    .filter((a) => a.count >= 3)  // минимум 3 звонка чтобы было статистически значимо
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, 3);

  // 2. Последние 5 coaching_tips
  const tipRows = await db
    .prepare(
      `SELECT a.call_id, a.coaching_tips_json
       FROM analyses a
       JOIN calls c ON c.id = a.call_id
       WHERE c.tenant_id = ?
         AND c.manager_id = ?
         AND a.coaching_tips_json IS NOT NULL
         AND a.coaching_tips_json != '[]'
       ORDER BY c.id DESC
       LIMIT 5`
    )
    .all<TipRow>(user.tenantId, user.bitrixManagerId);

  const recentTips: Array<{ callId: number; tip: string }> = [];
  for (const row of tipRows) {
    let tips: string[];
    try { tips = JSON.parse(row.coaching_tips_json || "[]"); } catch { continue; }
    for (const tip of tips) {
      if (recentTips.length < 5) recentTips.push({ callId: row.call_id, tip });
    }
  }

  if (aggregates.length === 0 && recentTips.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
      {/* Зоны роста — топ-3 худших пунктов чек-листа */}
      {aggregates.length > 0 && (
        <div className="ds-card">
          <h3 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingDown size={16} strokeWidth={2} color="var(--warning)" /> Зоны роста
          </h3>
          <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 14, fontSize: 12 }}>
            Пункты чек-листа с самой низкой средней оценкой за последние 30 дней.
            Не приговор — а подсказка где можно прибавить.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aggregates.map((a, i) => {
              const pct = a.avgScore * 100;
              return (
                <div key={a.title}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>
                      <span style={{ color: "var(--muted-foreground)", marginRight: 6 }}>{i + 1}.</span>
                      {a.title}
                    </span>
                    <span style={{
                      color: pct < 30 ? "var(--destructive)" : pct < 60 ? "var(--warning)" : "var(--success)",
                      fontWeight: 600,
                    }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: "var(--muted)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: pct < 30 ? "var(--destructive)" : pct < 60 ? "var(--warning)" : "var(--success)",
                    }} />
                  </div>
                  <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 2 }}>
                    Найдено в {a.count} звонках
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Последние советы — лента подсказок */}
      {recentTips.length > 0 && (
        <div className="ds-card">
          <h3 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Lightbulb size={16} strokeWidth={2} color="var(--primary)" /> Свежие подсказки
          </h3>
          <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 14, fontSize: 12 }}>
            Конкретные советы по последним звонкам. Кликните по # — откроется звонок.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {recentTips.map((t, i) => (
              <li key={`${t.callId}-${i}`} className="ds-body-sm" style={{ lineHeight: 1.5, display: "flex", gap: 8 }}>
                <a href={`/call-agent/calls/${t.callId}`} style={{ color: "var(--primary)", flexShrink: 0, fontWeight: 600 }}>
                  #{t.callId}
                </a>
                <span>{t.tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
