/**
 * §5.4 MASTER-TZ — Лидерборд для РОПа и админов.
 * С реальными именами (anonymize: false).
 * Manager-роль не имеет доступа сюда — у него есть обезличенный в /my.
 */
import { redirect } from "next/navigation";
import { Trophy, Target } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getLeaderboard, getWeeklyChallenge } from "@/lib/gamification";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role === "manager") redirect("/my");

  const [leaders, challenge] = await Promise.all([
    getLeaderboard({ tenantId: me.tenantId, anonymize: false, daysBack: 30 }),
    getWeeklyChallenge({ tenantId: me.tenantId }),
  ]);

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <Trophy size={22} strokeWidth={2} /> Лидерборд (30 дней)
      </h1>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 20 }}>
        Формула: средняя оценка × 10 + кол-во done + доля позитивных × 20. Минимум 3 done-звонка чтобы попасть в рейтинг.
      </p>

      {/* Челлендж недели */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Target size={16} strokeWidth={2} color="var(--destructive)" />
            <span style={{ fontWeight: 600 }}>Челлендж недели</span>
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 700, color: challenge.pct >= 100 ? "var(--success)" : "var(--foreground)" }}>
              {challenge.current}
            </span>
            <span style={{ color: "var(--muted-foreground)" }}> / {challenge.goal} звонков</span>
          </div>
        </div>
        <div style={{ height: 8, background: "var(--muted)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(100, challenge.pct)}%`, height: "100%",
            background: challenge.pct >= 100 ? "var(--success)" : "var(--primary)",
            transition: "width 200ms",
          }} />
        </div>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 4 }}>
          С {challenge.weekStart}. Цель меняется в tenants.settings.weekly_done_goal.
        </div>
      </div>

      {/* Таблица */}
      <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
        {leaders.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>
            Пока никто не набрал 3+ done-звонка за 30 дней. Подождите пока воркер обработает свежие звонки.
          </div>
        ) : (
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Менеджер</th>
                <th style={{ textAlign: "right", width: 90 }}>Звонков</th>
                <th style={{ textAlign: "right", width: 90 }}>Ср. оценка</th>
                <th style={{ textAlign: "right", width: 100 }}>Скрипт</th>
                <th style={{ textAlign: "right", width: 90 }}>Позитив</th>
                <th style={{ textAlign: "right", width: 80 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((l) => {
                const medal = l.rank === 1 ? "🥇" : l.rank === 2 ? "🥈" : l.rank === 3 ? "🥉" : null;
                return (
                  <tr key={l.manager_id}>
                    <td style={{ fontWeight: 700, fontSize: 16 }}>{medal || l.rank}</td>
                    <td style={{ fontWeight: 500 }}>{l.manager_name}</td>
                    <td style={{ textAlign: "right" }}>{l.done_count}</td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ color: (l.avg_score ?? 0) >= 7 ? "var(--success)" : (l.avg_score ?? 0) >= 5 ? "var(--warning)" : "var(--destructive)", fontWeight: 600 }}>
                        {l.avg_score?.toFixed(1) ?? "—"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {l.avg_compliance != null ? `${Math.round(l.avg_compliance * 100)}%` : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>{Math.round(l.positive_share * 100)}%</td>
                    <td style={{ textAlign: "right", color: "var(--primary)", fontWeight: 700 }}>
                      {l.score.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
