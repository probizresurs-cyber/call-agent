"use client";

/**
 * Шапка публичного отчёта (ссылка руководителю) + сервисные эффекты:
 *  - Тумблер темы (светлая/тёмная), сохраняется в localStorage (ca-report-theme),
 *    применяется классом .dark на <html>. Пред-пейнт скрипт (в layout) убирает мигание.
 *  - Запоминание «вида»: последний выбранный период (query) кладём в localStorage,
 *    при следующем заходе по «голой» ссылке — восстанавливаем. Выбрал раз → помнится.
 *  - Трекер захода: POST /api/public/report-view (для журнала владельца).
 *
 * Данные страницы серверные и force-dynamic → при каждом заходе/автообновлении
 * отчёт свежий; тут только UI-хром и клиентские предпочтения.
 */
import { useEffect, useState, useCallback } from "react";
import { Sun, Moon, RefreshCw, Activity } from "lucide-react";

const THEME_KEY = "ca-report-theme";
const VIEW_KEY = "ca-report-view"; // сохранённый query (период/фильтры)

function applyTheme(theme: "light" | "dark") {
  const el = document.documentElement;
  if (theme === "dark") el.classList.add("dark");
  else el.classList.remove("dark");
}

export function ReportChrome({
  token,
  kind = "dashboard",
  tenantName,
  periodLabel,
  autoRefreshSec = 300,
}: {
  token: string;
  kind?: "dashboard" | "tv";
  tenantName: string;
  periodLabel: string;
  autoRefreshSec?: number;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  // ── Тема: читаем сохранённую, применяем ──
  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as "light" | "dark" | null) ?? "light";
    setTheme(saved);
    applyTheme(saved);
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  // ── Запоминание периода/вида ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    const hasPeriod = /[?&](from|to|period|manager_id|with_crm)=/.test(search);
    if (hasPeriod) {
      // Пользователь выбрал вид — запомним для следующего раза
      localStorage.setItem(VIEW_KEY, search);
    } else {
      // Голая ссылка — если есть сохранённый вид, восстановим
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved && saved.length > 1) {
        window.location.replace(window.location.pathname + saved);
      }
    }
  }, []);

  // ── Трекер захода ──
  useEffect(() => {
    fetch("/call-agent/api/public/report-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, kind }),
      keepalive: true,
    }).catch(() => {});
  }, [token, kind]);

  // ── Мягкое автообновление, чтобы отчёт оставался свежим ──
  useEffect(() => {
    if (!autoRefreshSec) return;
    const t = setInterval(() => window.location.reload(), autoRefreshSec * 1000);
    return () => clearInterval(t);
  }, [autoRefreshSec]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "14px 18px",
        marginBottom: 18,
        borderRadius: 14,
        background:
          "linear-gradient(120deg, color-mix(in srgb, var(--primary) 14%, var(--card)) 0%, var(--card) 60%)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "var(--primary)",
            }}
          >
            Отчёт по звонкам
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "var(--muted-foreground)",
            }}
          >
            <Activity size={11} style={{ color: "#22c55e" }} /> обновляется автоматически
          </span>
        </div>
        <h1 className="ds-h1" style={{ margin: "2px 0 0", fontSize: 22, lineHeight: 1.15, overflowWrap: "anywhere" }}>
          {tenantName}
        </h1>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 2 }}>
          Период: <b style={{ color: "var(--foreground)" }}>{periodLabel}</b>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="ds-btn ds-btn-ghost"
          title="Обновить сейчас"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36 }}
        >
          <RefreshCw size={15} />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="ds-btn ds-btn-secondary"
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, minWidth: 44, justifyContent: "center" }}
        >
          {mounted && theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
}
