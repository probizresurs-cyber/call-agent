import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, Phone, Settings, LogOut, ShieldCheck, Headphones, User as UserIcon, Activity, Upload, FilePlus2, Users, Trophy, Bell, Scale } from "lucide-react";
import { getSessionUser, logout, canManage, canViewTeam, type UserRole } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  head: "РОП",
  manager: "Менеджер",
};

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }

  // Менеджер видит «Мои звонки» вместо общего «Звонки», и не видит «Настройки»
  const showSettings = canManage(user.role) || user.role === "head";
  const callsLabel = user.role === "manager" ? "Мои звонки" : "Звонки";
  const dashboardLabel = user.role === "manager" ? "Мой кабинет" : "Дашборд";

  // Показывать «Расхождения» только для owner/admin/head
  const showDiscrepancies = canViewTeam(user.role);

  // Число pending-расхождений для бейджа в навигации
  let pendingDiscrepanciesCount = 0;
  if (showDiscrepancies) {
    try {
      const row = await getDbAsync()
        .prepare(
          `SELECT COUNT(*) AS n FROM card_discrepancies WHERE tenant_id = ? AND status = 'pending'`
        )
        .get<{ n: number }>(user.tenantId);
      pendingDiscrepanciesCount = row?.n ?? 0;
    } catch {
      // table may not exist yet — ignore
    }
  }

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px" }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg,#7c70e0,#5b4fc7)",
              display: "grid", placeItems: "center",
              color: "#fff", fontWeight: 700,
            }}
          >CA</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Call-Agent</div>
            <div style={{ fontSize: 11, color: "var(--sidebar-muted)" }}>AI-анализ коммуникаций</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Link className="nav-link" href="/dashboard">
            <BarChart3 size={16} strokeWidth={2} /> {dashboardLabel}
          </Link>
          <Link className="nav-link" href="/calls">
            <Phone size={16} strokeWidth={2} /> {callsLabel}
          </Link>
          <Link className="nav-link" href="/clients">
            <Users size={16} strokeWidth={2} /> Заказчики
          </Link>
          {user.role === "manager" && (
            <Link className="nav-link" href="/my">
              <Bell size={16} strokeWidth={2} /> Мой кабинет
            </Link>
          )}
          {user.role !== "manager" && (
            <Link className="nav-link" href="/leaderboard">
              <Trophy size={16} strokeWidth={2} /> Лидерборд
            </Link>
          )}
          {showSettings && (
            <Link className="nav-link" href="/interactions/upload">
              <FilePlus2 size={16} strokeWidth={2} /> Загрузить запись
            </Link>
          )}
          {showSettings && (
            <Link className="nav-link" href="/queue">
              <Activity size={16} strokeWidth={2} /> Очередь
            </Link>
          )}
          {showSettings && (
            <Link className="nav-link" href="/crm-log">
              <Upload size={16} strokeWidth={2} /> CRM-журнал
            </Link>
          )}
          {showDiscrepancies && (
            <Link
              className="nav-link"
              href="/discrepancies"
              style={{ position: "relative" }}
            >
              <Scale size={16} strokeWidth={2} /> Расхождения
              {pendingDiscrepanciesCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    background: "var(--destructive)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 5px",
                    lineHeight: 1,
                  }}
                >
                  {pendingDiscrepanciesCount > 99 ? "99+" : pendingDiscrepanciesCount}
                </span>
              )}
            </Link>
          )}
          {showSettings && (
            <Link className="nav-link" href="/settings">
              <Settings size={16} strokeWidth={2} /> Настройки
            </Link>
          )}
        </nav>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--sidebar-fg)", fontWeight: 600 }}>
              {user.role === "owner" || user.role === "admin"
                ? <ShieldCheck size={12} strokeWidth={2} />
                : user.role === "head"
                ? <Headphones size={12} strokeWidth={2} />
                : <UserIcon size={12} strokeWidth={2} />}
              {user.name || user.login}
            </div>
            <div style={{ fontSize: 11, color: "var(--sidebar-muted)", marginTop: 2 }}>
              {ROLE_LABELS[user.role]}
            </div>
          </div>
          <form action={doLogout}>
            <button type="submit" className="ds-btn ds-btn-secondary" style={{
              width: "100%",
              background: "rgba(255,255,255,0.06)",
              borderColor: "rgba(255,255,255,0.12)",
              color: "var(--sidebar-fg)",
              gap: 8,
            }}>
              <LogOut size={14} strokeWidth={2} />
              Выйти
            </button>
          </form>
        </div>
      </aside>

      <main className="shell-main">{children}</main>
    </div>
  );
}
