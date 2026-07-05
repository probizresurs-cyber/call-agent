"use client";

/**
 * Переключатель темы портала: Светлая / Тёмная / Тёплая.
 * Тема = класс на <html> (dark|warm, светлая = без класса). Сохраняется в
 * localStorage (ca-theme). Пред-пейнт скрипт в корневом layout применяет её
 * ДО отрисовки, чтобы не мигало.
 *
 * variant:
 *  - "sidebar" — компактный сегмент для тёмного сайдбара (десктоп).
 *  - "bar"     — для мобильного топбара (светлый фон).
 */
import { useEffect, useState } from "react";
import { Sun, Moon, Coffee } from "lucide-react";

type Theme = "light" | "dark" | "warm";
const KEY = "ca-theme";

const OPTIONS: { value: Theme; icon: typeof Sun; title: string }[] = [
  { value: "light", icon: Sun, title: "Светлая" },
  { value: "dark", icon: Moon, title: "Тёмная" },
  { value: "warm", icon: Coffee, title: "Тёплая" },
];

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("dark", "warm");
  if (theme === "dark" || theme === "warm") el.classList.add(theme);
}

export function ThemeSwitcher({ variant = "sidebar" }: { variant?: "sidebar" | "bar" }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme | null) ?? "light";
    setTheme(saved);
    applyTheme(saved);
    setMounted(true);
  }, []);

  function pick(t: Theme) {
    setTheme(t);
    localStorage.setItem(KEY, t);
    applyTheme(t);
  }

  const sidebar = variant === "sidebar";
  const containerBg = sidebar ? "rgba(255,255,255,0.06)" : "var(--muted)";
  const activeBg = sidebar ? "rgba(255,255,255,0.16)" : "var(--card)";
  const activeColor = sidebar ? "#ffffff" : "var(--primary)";
  const idleColor = sidebar ? "var(--sidebar-muted)" : "var(--muted-foreground)";

  return (
    <div
      role="group"
      aria-label="Тема оформления"
      style={{
        display: "inline-flex",
        gap: 3,
        padding: 3,
        borderRadius: 9,
        background: containerBg,
      }}
    >
      {OPTIONS.map(({ value, icon: Icon, title }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            onClick={() => pick(value)}
            style={{
              width: 30,
              height: 28,
              display: "grid",
              placeItems: "center",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              background: active ? activeBg : "transparent",
              color: active ? activeColor : idleColor,
              boxShadow: active && !sidebar ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
              transition: "background 0.12s, color 0.12s",
            }}
          >
            <Icon size={15} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
