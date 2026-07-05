/**
 * /dynamics — «Динамика по менеджерам» (отчёт для РОПа).
 *
 * Показывает по каждому менеджеру: растёт ли выполнение чек-листа со временем
 * (учится / застрял / просел), недельный тренд и какие навыки улучшились или
 * застряли низко. Доступ: owner/admin/head (canViewTeam).
 */
import { redirect } from "next/navigation";
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Users } from "lucide-react";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getTeamDynamics, type ManagerDynamics } from "@/lib/team-dynamics";

export const dynamic = "force-dynamic";

const VERDICT: Record<ManagerDynamics["verdict"], { label: string; color: string; Icon: typeof TrendingUp }> = {
  growing: { label: "Растёт", color: "var(--success)", Icon: TrendingUp },
  stuck: { label: "Застрял", color: "var(--warning)", Icon: Minus },
  declining: { label: "Просел", color: "var(--destructive)", Icon: TrendingDown },
  insufficient: { label: "Мало данных", color: "var(--muted-foreground)", Icon: Minus },
};

function pct(v: number) { return `${Math.round(v * 100)}%`; }

export default async function DynamicsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canViewTeam(me.role)) redirect("/dashboard");

  const managers = await getTeamDynamics(me.tenantId, 8);

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <h1 className="ds-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={22} strokeWidth={2} /> Динамика по менеджерам
        </h1>
      </div>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 20, maxWidth: 720 }}>
        Учится ли менеджер? Сравниваем выполнение чек-листа в начале периода и сейчас (последние 8 недель).
        <b style={{ color: "var(--success)" }}> Растёт</b> — балл вырос, <b style={{ color: "var(--warning)" }}>Застрял</b> — стоит на месте,
        <b style={{ color: "var(--destructive)" }}> Просел</b> — стало хуже. Ниже — какие навыки подтянулись, а какие не меняются.
      </p>

      {managers.length === 0 ? (
        <div className="ds-card" style={{ textAlign: "center", color: "var(--muted-foreground)", padding: "40px 0" }}>
          Пока недостаточно оценённых звонков для динамики (нужно ≥ 10 на менеджера за 8 недель).
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {managers.map((m) => (
            <ManagerCard key={m.managerId} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerCard({ m }: { m: ManagerDynamics }) {
  const v = VERDICT[m.verdict];
  const maxW = Math.max(1, ...m.weeks.map((w) => w.compliance));
  return (
    <div className="ds-card">
      {/* Шапка карточки */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{m.name}</span>
          <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{m.calls} звонков</span>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700,
          color: v.color, background: `color-mix(in srgb, ${v.color} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${v.color} 40%, transparent)`,
          borderRadius: 999, padding: "4px 12px",
        }}>
          <v.Icon size={15} /> {v.label}
        </span>
      </div>

      {/* Тренд: было → стало + спарклайн */}
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Чек-лист:</span>
          <span style={{ fontWeight: 700 }}>{pct(m.earlyCompliance)}</span>
          <span style={{ color: "var(--muted-foreground)" }}>→</span>
          <span style={{ fontWeight: 700, color: v.color }}>{pct(m.recentCompliance)}</span>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
            {m.weeks.map((w) => (
              <div key={w.week} title={`${w.week}: ${pct(w.compliance)} (${w.calls} зв.)`}
                style={{ flex: 1, minWidth: 4, height: `${Math.max(4, (w.compliance / maxW) * 40)}px`, background: v.color, opacity: 0.55, borderRadius: 2 }} />
            ))}
          </div>
          {m.weeks.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10.5, color: "var(--muted-foreground)" }}>
              <span>{m.weeks[0].week.slice(8, 10)}.{m.weeks[0].week.slice(5, 7)}</span>
              <span>сейчас · {m.weeks.length} нед.</span>
            </div>
          )}
        </div>
      </div>

      {/* Навыки: выросли / застряли */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <SkillList title="Подтянул" icon={<ArrowUp size={13} color="var(--success)" />} color="var(--success)"
          items={m.improved.map((s) => ({ title: s.title, from: s.early, to: s.recent }))}
          empty="Заметного роста навыков пока нет" />
        <SkillList title="Не меняется / низко" icon={<ArrowDown size={13} color="var(--warning)" />} color="var(--warning)"
          items={m.regressed.map((s) => ({ title: s.title, from: s.early, to: s.recent }))}
          empty="Слабых застрявших навыков нет" />
      </div>
    </div>
  );
}

function SkillList({ title, icon, color, items, empty }: {
  title: string; icon: React.ReactNode; color: string;
  items: { title: string; from: number; to: number }[]; empty: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
        {icon} {title}
      </div>
      {items.length === 0 ? (
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((s) => (
            <div key={s.title} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
              <span style={{ overflowWrap: "anywhere" }}>{s.title}</span>
              <span style={{ whiteSpace: "nowrap", color: "var(--muted-foreground)", fontSize: 12 }}>
                {pct(s.from)} <span style={{ color }}>→ {pct(s.to)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
