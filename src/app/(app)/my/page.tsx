/**
 * §5.1 MASTER-TZ — Кабинет менеджера.
 *
 * Сводная страница для роли manager: его напоминания, оборванные нити по его заказчикам,
 * место в лидерборде, streaks/ачивки, текущий weekly challenge.
 *
 * Доступ — только для роли manager (или head/owner посмотреть за конкретного через ?as=managerId,
 * но это будущая итерация).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  User, Bell, AlertTriangle, Trophy, Flame, CheckCircle2, Target, Award,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { listReminders } from "@/lib/reminders";
import { getLeaderboard, getManagerStreak, getAchievementsFor, getWeeklyChallenge } from "@/lib/gamification";
import { ReminderRow } from "./ReminderRow";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "manager") redirect("/dashboard");

  const bxId = me.bitrixManagerId;
  if (!bxId) {
    return (
      <div className="ds-card" style={{ padding: 40, textAlign: "center" }}>
        <User size={32} strokeWidth={1.5} color="var(--muted-foreground)" style={{ marginBottom: 10 }} />
        <div className="ds-body" style={{ color: "var(--muted-foreground)" }}>
          Ваш аккаунт не привязан к Bitrix-менеджеру. Обратитесь к РОПу — он привяжет в Настройках.
        </div>
      </div>
    );
  }

  const [reminders, streak, achievements, leaderboard, challenge] = await Promise.all([
    listReminders({ tenantId: me.tenantId, bitrixManagerId: bxId, status: "pending", limit: 20 }),
    getManagerStreak({ tenantId: me.tenantId, bitrixManagerId: bxId }),
    getAchievementsFor({ tenantId: me.tenantId, bitrixManagerId: bxId }),
    getLeaderboard({ tenantId: me.tenantId, myManagerId: bxId, anonymize: true, daysBack: 30 }),
    getWeeklyChallenge({ tenantId: me.tenantId }),
  ]);

  const my = leaderboard.find((l) => l.is_me);
  const earnedCount = achievements.filter((a) => a.earned).length;

  // Группируем напоминания: просроченные, сегодня, позже
  const now = Date.now();
  const overdue = reminders.filter((r) => new Date(r.due_at.replace(" ", "T")).getTime() < now);
  const today = reminders.filter((r) => {
    const t = new Date(r.due_at.replace(" ", "T")).getTime();
    return t >= now && t < now + 86400000;
  });
  const later = reminders.filter((r) => new Date(r.due_at.replace(" ", "T")).getTime() >= now + 86400000);

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <User size={22} strokeWidth={2} /> Мой кабинет
        {me.name && <span style={{ fontSize: 16, color: "var(--muted-foreground)", fontWeight: 500 }}>· {me.name}</span>}
      </h1>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 20 }}>
        Ваши задачи, рост и место в команде.
      </p>

      {/* KPI верхние плитки */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiTile
          icon={<Flame size={18} color="var(--warning)" />}
          label="Серия"
          value={`${streak.current_streak} дн.`}
          hint={streak.longest_streak > streak.current_streak ? `Рекорд ${streak.longest_streak}` : "Это ваш рекорд!"}
        />
        <KpiTile
          icon={<Trophy size={18} color="var(--primary)" />}
          label="Место"
          value={my ? `#${my.rank}` : "—"}
          hint={my ? `из ${leaderboard.length}` : "пока нет данных"}
        />
        <KpiTile
          icon={<Award size={18} color="var(--success)" />}
          label="Ачивки"
          value={`${earnedCount} / ${achievements.length}`}
          hint="Выполнено достижений"
        />
        <KpiTile
          icon={<Target size={18} color="var(--destructive)" />}
          label="Челлендж недели"
          value={`${challenge.current} / ${challenge.goal}`}
          hint={`${challenge.pct.toFixed(0)}% выполнено командой`}
        />
      </div>

      {/* Напоминания */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={16} strokeWidth={2} /> Напоминания ({reminders.length})
        </h2>
        {reminders.length === 0 ? (
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", padding: 12 }}>
            Активных напоминаний нет. Будут создаваться автоматически из «следующего шага» по обработанным звонкам.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {overdue.length > 0 && (
              <ReminderGroup title={`Просроченные (${overdue.length})`} color="var(--destructive)" items={overdue} />
            )}
            {today.length > 0 && (
              <ReminderGroup title={`Сегодня (${today.length})`} color="var(--warning)" items={today} />
            )}
            {later.length > 0 && (
              <ReminderGroup title={`Позже (${later.length})`} color="var(--muted-foreground)" items={later} />
            )}
          </div>
        )}
      </div>

      {/* Лидерборд */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={16} strokeWidth={2} /> Лидерборд (30 дней)
        </h2>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginBottom: 10 }}>
          Имена коллег скрыты — видно только ваше. Формула: средняя оценка × 10 + кол-во done + доля позитивных × 20.
        </p>
        <table className="ds-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th>Менеджер</th>
              <th style={{ textAlign: "right" }}>Звонков</th>
              <th style={{ textAlign: "right" }}>Ср. оценка</th>
              <th style={{ textAlign: "right" }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.slice(0, 10).map((l) => (
              <tr key={l.manager_id} style={{
                background: l.is_me ? "rgba(124, 112, 224, 0.08)" : undefined,
                fontWeight: l.is_me ? 600 : undefined,
              }}>
                <td style={{ fontWeight: 600 }}>{l.rank}</td>
                <td>{l.manager_name}{l.is_me && " (вы)"}</td>
                <td style={{ textAlign: "right" }}>{l.done_count}</td>
                <td style={{ textAlign: "right" }}>{l.avg_score?.toFixed(1) ?? "—"}</td>
                <td style={{ textAlign: "right", color: "var(--primary)" }}>{l.score.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ачивки */}
      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Award size={16} strokeWidth={2} /> Достижения
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {achievements.map((a) => (
            <AchievementCard key={a.id} a={a} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Components ──

function KpiTile({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="ds-card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {icon}
        <span className="ds-body-sm" style={{ textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5, fontSize: 11, color: "var(--muted-foreground)" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {hint && <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 2, fontSize: 11 }}>{hint}</div>}
    </div>
  );
}

function ReminderGroup({ title, color, items }: { title: string; color: string; items: Array<{ id: number; call_id: number | null; title: string; due_at: string }> }) {
  return (
    <div>
      <div className="ds-caption" style={{ color, marginBottom: 6, fontWeight: 600 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((r) => <ReminderRow key={r.id} r={r} />)}
      </div>
    </div>
  );
}

function AchievementCard({ a }: { a: { id: string; title: string; description: string; earned: boolean; progress?: number } }) {
  return (
    <div style={{
      padding: 12,
      background: a.earned ? "rgba(34,197,94,0.06)" : "var(--muted)",
      border: `1px solid ${a.earned ? "rgba(34,197,94,0.30)" : "var(--border)"}`,
      borderRadius: 8,
      opacity: a.earned ? 1 : 0.65,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {a.earned ? <CheckCircle2 size={16} color="var(--success)" /> : <Award size={16} color="var(--muted-foreground)" />}
        <span style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</span>
      </div>
      <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginBottom: 6 }}>
        {a.description}
      </div>
      {!a.earned && a.progress !== undefined && a.progress > 0 && (
        <div style={{ height: 4, background: "var(--background)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${a.progress * 100}%`, height: "100%", background: "var(--primary)" }} />
        </div>
      )}
    </div>
  );
}
