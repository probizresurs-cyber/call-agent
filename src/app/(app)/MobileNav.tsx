"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Phone, Settings, LogOut, ShieldCheck, Headphones,
  User as UserIcon, Activity, Upload, FilePlus2, Users, Trophy, Bell, Scale,
  FileText, Menu, X,
} from "lucide-react";

// Иконки передаём строкой (server→client boundary не сериализует компоненты),
// здесь маппим обратно на lucide-компонент.
const ICONS = {
  BarChart3, Phone, Settings, Activity, Upload, FilePlus2, Users, Trophy, Bell, Scale, FileText,
} as const;

export type NavIconName = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** число для бейджа (например, pending-расхождения) */
  badge?: number;
}

export interface MobileNavProps {
  navItems: NavItem[];
  userName: string;
  roleLabel: string;
  /** какую иконку показать рядом с именем пользователя */
  roleIcon: "ShieldCheck" | "Headphones" | "User";
  /** server action для выхода */
  logoutAction: () => void | Promise<void>;
}

const ROLE_ICONS = { ShieldCheck, Headphones, User: UserIcon } as const;

export function MobileNav({
  navItems,
  userName,
  roleLabel,
  roleIcon,
  logoutAction,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const RoleIcon = ROLE_ICONS[roleIcon];

  // Закрытие по Escape + блокировка скролла body, пока drawer открыт (mobile)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Топ-бар: виден только на мобиле (<768px), скрыт на десктопе через CSS */}
      <header className="mobile-topbar">
        <button
          type="button"
          aria-label="Открыть меню"
          aria-expanded={open}
          className="mobile-burger"
          onClick={() => setOpen(true)}
        >
          <Menu size={22} strokeWidth={2} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26, height: 26, borderRadius: 7,
              background: "linear-gradient(135deg,#7c70e0,#5b4fc7)",
              display: "grid", placeItems: "center",
              color: "#fff", fontWeight: 700, fontSize: 12,
            }}
          >CA</div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Call-Agent</span>
        </div>
      </header>

      {/* Затемнение фона — только когда drawer открыт */}
      <div
        className={`mobile-overlay${open ? " open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Боковое меню. На десктопе — статичное; на мобиле — выезжающий drawer */}
      <aside className={`shell-sidebar${open ? " open" : ""}`}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px" }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg,#7c70e0,#5b4fc7)",
              display: "grid", placeItems: "center",
              color: "#fff", fontWeight: 700,
            }}
          >CA</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Call-Agent</div>
            <div style={{ fontSize: 11, color: "var(--sidebar-muted)" }}>
              AI-анализ коммуникаций
            </div>
          </div>
          {/* Кнопка закрытия — видна только на мобиле (CSS) */}
          <button
            type="button"
            aria-label="Закрыть меню"
            className="mobile-close"
            onClick={() => setOpen(false)}
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                className={`nav-link${active ? " active" : ""}`}
                href={item.href}
                onClick={() => setOpen(false)}
                style={item.badge ? { position: "relative" } : undefined}
              >
                <Icon size={16} strokeWidth={2} />
                <span>{item.label}</span>
                {item.badge && item.badge > 0 ? (
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
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--sidebar-fg)",
                fontWeight: 600,
              }}
            >
              <RoleIcon size={12} strokeWidth={2} />
              {userName}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--sidebar-muted)", marginTop: 2 }}
            >
              {roleLabel}
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="ds-btn ds-btn-secondary"
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.12)",
                color: "var(--sidebar-fg)",
                gap: 8,
              }}
            >
              <LogOut size={14} strokeWidth={2} />
              Выйти
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
