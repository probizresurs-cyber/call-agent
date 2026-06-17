import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { getSessionUser, logout, canManage, canViewTeam, type UserRole } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { MobileNav, type NavItem } from "./MobileNav";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  head: "РОП",
  manager: "Менеджер",
  demo: "Демо-доступ",
};

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }

  // Демо-режим (ООО Ромашка): только просмотр витрины — урезанное меню + баннер.
  const isDemo = user.role === "demo";

  // Менеджер видит «Мои звонки» вместо общего «Звонки», и не видит «Настройки»
  // В демо-режиме «Настройки» показываем (read-only) — чтобы клиент увидел скрипты/чек-листы.
  const showSettings = canManage(user.role) || user.role === "head" || isDemo;
  const callsLabel = user.role === "manager" ? "Мои звонки" : "Звонки";
  const dashboardLabel = user.role === "manager" ? "Мой кабинет" : "Дашборд";

  // Показывать «Расхождения»/«Отчёты» — owner/admin/head. В демо-режиме скрываем
  // (это операционные инструменты, в витрине не нужны).
  const showDiscrepancies = canViewTeam(user.role) && !isDemo;
  // Тяжёлые операционные пункты (загрузка/очередь/CRM-журнал) — только для управленцев,
  // в демо-режиме скрываем даже несмотря на showSettings=true.
  const showOps = showSettings && !isDemo;

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
  if (showOps) {
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
    // «Заявки» (онбординг новых клиентов) — внутренний инструмент, в меню платформы
    // не показываем. Просмотр заявок — в админ-кабинете Call-Agent (MarketRadar).
    // Роут /onboarding-requests остаётся доступен по прямой ссылке для владельца.
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
      <main className="shell-main">
        {isDemo && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              marginBottom: 16,
              background: "rgba(124,112,224,0.10)",
              border: "1px solid rgba(124,112,224,0.35)",
              borderRadius: 8,
              color: "var(--foreground)",
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <Eye size={18} strokeWidth={2} style={{ flexShrink: 0, color: "#7c70e0" }} />
            <span>
              <b>Демо-режим</b> — данные вымышленные (ООО «Ромашка»). Доступен только просмотр,
              изменения недоступны.
            </span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
