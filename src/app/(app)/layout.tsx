import { redirect } from "next/navigation";
import { getSessionUser, logout, canManage, canViewTeam, type UserRole } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { MobileNav, type NavItem } from "./MobileNav";

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

  // Собираем пункты меню как сериализуемые данные (иконки — строкой),
  // чтобы прокинуть их в client-компонент MobileNav.
  const navItems: NavItem[] = [
    { href: "/dashboard", label: dashboardLabel, icon: "BarChart3" },
    { href: "/calls", label: callsLabel, icon: "Phone" },
    { href: "/clients", label: "Заказчики", icon: "Users" },
  ];
  if (user.role === "manager") {
    navItems.push({ href: "/my", label: "Мой кабинет", icon: "Bell" });
  }
  if (user.role !== "manager") {
    navItems.push({ href: "/leaderboard", label: "Лидерборд", icon: "Trophy" });
  }
  if (showSettings) {
    navItems.push({ href: "/interactions/upload", label: "Загрузить запись", icon: "FilePlus2" });
    navItems.push({ href: "/queue", label: "Очередь", icon: "Activity" });
    navItems.push({ href: "/crm-log", label: "CRM-журнал", icon: "Upload" });
  }
  if (showDiscrepancies) {
    navItems.push({
      href: "/discrepancies",
      label: "Расхождения",
      icon: "Scale",
      badge: pendingDiscrepanciesCount,
    });
    navItems.push({ href: "/reports", label: "Отчёты", icon: "FileText" });
  }
  if (showSettings) {
    navItems.push({ href: "/settings", label: "Настройки", icon: "Settings" });
  }

  const roleIcon =
    user.role === "owner" || user.role === "admin"
      ? "ShieldCheck"
      : user.role === "head"
      ? "Headphones"
      : "User";

  return (
    <div className="shell">
      <MobileNav
        navItems={navItems}
        userName={user.name || user.login}
        roleLabel={ROLE_LABELS[user.role]}
        roleIcon={roleIcon}
        logoutAction={doLogout}
      />
      <main className="shell-main">{children}</main>
    </div>
  );
}
