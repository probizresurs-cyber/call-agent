"use client";

/**
 * Кнопка «Поделиться» в шапке дашборда — открывает popover с публичной ссылкой.
 * Та же логика что у DashboardShareCard в /settings, но компактным popover'ом.
 * Видна только не-manager (для manager здесь незачем).
 *
 * Внизу popover — компактный ЖУРНАЛ просмотров ссылки (кто/когда заходил):
 * заходы за 30 дней, уникальные зрители, регулярность, спарклайн, последние заходы.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Share2, Copy, RotateCw, X, Tv, Eye, ExternalLink, Clock, Users, CalendarCheck } from "lucide-react";

interface Props {
  initialToken: string | null;
  baseUrl: string;
}

interface ViewStats {
  total30d: number;
  uniqueViewers30d: number;
  lastViewedAt: string | null;
  activeDays30d: number;
  perDay: { date: string; count: number }[];
  recent: { viewedAt: string; kind: string; device: string; ipMasked: string | null }[];
}

export function ShareDashboardButton({ initialToken, baseUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"normal" | "tv" | null>(null);
  const [stats, setStats] = useState<ViewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const url = token ? `${baseUrl}/call-agent/public/dashboard/${token}` : null;
  const tvUrl = token ? `${baseUrl}/call-agent/public/dashboard/${token}?tv=1` : null;

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await fetch("/call-agent/api/dashboard-share/views", { cache: "no-store" });
      const data = await r.json();
      if (data.ok) setStats(data.stats);
    } catch { /* ignore */ } finally { setStatsLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (token) loadStats();
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, token, loadStats]);

  async function gen() {
    setBusy(true);
    try {
      const r = await fetch("/call-agent/api/dashboard-share", { method: "POST" });
      const data = await r.json();
      if (data.ok) setToken(data.token);
    } finally { setBusy(false); }
  }

  async function revoke() {
    if (!confirm("Отозвать ссылку? Все кто её знают перестанут видеть дашборд.")) return;
    setBusy(true);
    try {
      const r = await fetch("/call-agent/api/dashboard-share", { method: "DELETE" });
      if (r.ok) setToken(null);
    } finally { setBusy(false); }
  }

  async function copy(text: string, which: "normal" | "tv") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ds-btn ds-btn-secondary"
        title="Поделиться дашбордом по публичной ссылке"
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Share2 size={14} />
        Поделиться
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          padding: 16, width: 460, maxWidth: "calc(100vw - 30px)",
          maxHeight: "calc(100vh - 90px)", overflowY: "auto",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <Share2 size={14} /> Публичная ссылка
            </div>
            <button onClick={() => setOpen(false)} className="ds-btn ds-btn-ghost" style={{ padding: 4 }}>
              <X size={14} />
            </button>
          </div>

          {!token ? (
            <>
              <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 12 }}>
                Любой кто откроет ссылку увидит read-only дашборд: KPI и таблицу менеджеров.
                Без логина. Руководитель клиента может выбрать период и тему (светлая/тёмная) —
                выбор запоминается. ТВ-режим — полноэкранное табло для экрана в офисе.
              </p>
              <button onClick={gen} disabled={busy} className="ds-btn ds-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                {busy ? "Создаю..." : "Создать ссылку"}
              </button>
            </>
          ) : (
            <>
              {/* Обычная ссылка */}
              <div className="ds-body-sm" style={{ marginBottom: 4, fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                <Eye size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> Для руководителя
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                <input
                  readOnly
                  value={url ?? ""}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  style={{
                    flex: 1, padding: "6px 8px", fontSize: 11, fontFamily: "monospace",
                    background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4,
                    minWidth: 0,
                  }}
                />
                <button onClick={() => url && copy(url, "normal")} className="ds-btn ds-btn-secondary" style={{ padding: "0 8px", fontSize: 11 }}>
                  <Copy size={11} style={{ marginRight: 3 }} />
                  {copied === "normal" ? "OK" : "Копировать"}
                </button>
                <a href={url ?? "#"} target="_blank" rel="noreferrer" className="ds-btn ds-btn-ghost" style={{ padding: "0 6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }} title="Открыть">
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* TV-режим */}
              <div className="ds-body-sm" style={{ marginBottom: 4, fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                <Tv size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> ТВ-режим (табло в офисе)
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
                <input
                  readOnly
                  value={tvUrl ?? ""}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  style={{
                    flex: 1, padding: "6px 8px", fontSize: 11, fontFamily: "monospace",
                    background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4,
                    minWidth: 0,
                  }}
                />
                <button onClick={() => tvUrl && copy(tvUrl, "tv")} className="ds-btn ds-btn-secondary" style={{ padding: "0 8px", fontSize: 11 }}>
                  <Copy size={11} style={{ marginRight: 3 }} />
                  {copied === "tv" ? "OK" : "Копировать"}
                </button>
                <a href={tvUrl ?? "#"} target="_blank" rel="noreferrer" className="ds-btn ds-btn-ghost" style={{ padding: "0 6px", textDecoration: "none", display: "inline-flex", alignItems: "center" }} title="Открыть в новой вкладке">
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* ── ЖУРНАЛ просмотров ── */}
              <ViewJournal stats={stats} loading={statsLoading} />

              <div style={{ display: "flex", gap: 4, paddingTop: 10, marginTop: 12, borderTop: "1px solid var(--border)" }}>
                <button onClick={gen} disabled={busy} className="ds-btn ds-btn-ghost" style={{ fontSize: 12 }} title="Сгенерировать новый токен — старая ссылка перестанет работать">
                  <RotateCw size={11} style={{ marginRight: 3 }} />
                  Перегенерировать
                </button>
                <button onClick={revoke} disabled={busy} className="ds-btn ds-btn-ghost" style={{ fontSize: 12, color: "var(--destructive)", marginLeft: "auto" }}>
                  <X size={11} style={{ marginRight: 3 }} />
                  Отозвать
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Журнал просмотров (компактный) ──
function ViewJournal({ stats, loading }: { stats: ViewStats | null; loading: boolean }) {
  const maxDay = stats ? Math.max(1, ...stats.perDay.map((d) => d.count)) : 1;
  return (
    <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Eye size={13} /> Журнал просмотров
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-foreground)", fontWeight: 400 }}>за 30 дней</span>
      </div>

      {loading && !stats ? (
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Загрузка…</div>
      ) : !stats || stats.total30d === 0 ? (
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
          Ссылку ещё не открывали. Как только руководитель зайдёт — здесь появятся заходы.
        </div>
      ) : (
        <>
          {/* 3 метрики */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
            <Metric icon={<Eye size={13} />} value={String(stats.total30d)} label="заходов" />
            <Metric icon={<Users size={13} />} value={String(stats.uniqueViewers30d)} label="зрителей" />
            <Metric icon={<CalendarCheck size={13} />} value={`${stats.activeDays30d}/30`} label="дней с заходами" />
          </div>

          {/* Спарклайн за 14 дней */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32, marginBottom: 4 }}>
            {stats.perDay.map((d) => (
              <div
                key={d.date}
                title={`${fmtDay(d.date)}: ${d.count}`}
                style={{
                  flex: 1,
                  height: `${Math.max(3, (d.count / maxDay) * 32)}px`,
                  background: d.count > 0 ? "var(--primary)" : "var(--muted)",
                  borderRadius: 2,
                  opacity: d.count > 0 ? 1 : 0.5,
                }}
              />
            ))}
          </div>
          <div className="ds-body-sm" style={{ fontSize: 10, color: "var(--muted-foreground)", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
            <span>14 дней назад</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} /> посл.: {stats.lastViewedAt ? relTime(stats.lastViewedAt) : "—"}
            </span>
          </div>

          {/* Последние заходы */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {stats.recent.slice(0, 6).map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                padding: "5px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}>
                <span style={{ color: "var(--foreground)", minWidth: 96 }}>{fmtDateTime(r.viewedAt)}</span>
                <span style={{ color: "var(--muted-foreground)" }}>{r.device}</span>
                {r.kind === "tv" && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "var(--accent)", color: "var(--primary)" }}>ТВ</span>
                )}
                {r.ipMasked && (
                  <span style={{ marginLeft: "auto", color: "var(--muted-foreground)", fontSize: 10, fontFamily: "monospace" }}>{r.ipMasked}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div style={{ background: "var(--muted)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted-foreground)" }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

function fmtDay(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (isNaN(d.getTime())) return "—";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  if (days === 1) return "вчера";
  if (days < 30) return `${days} дн назад`;
  return `${Math.floor(days / 30)} мес назад`;
}
