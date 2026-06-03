"use client";

/**
 * Кнопка «Поделиться» в шапке дашборда — открывает popover с публичной ссылкой.
 * Та же логика что у DashboardShareCard в /settings, но компактным popover'ом.
 * Видна только не-manager (для manager здесь незачем).
 */
import { useEffect, useRef, useState } from "react";
import { Share2, Copy, RotateCw, X, Tv, Eye, ExternalLink } from "lucide-react";

interface Props {
  initialToken: string | null;
  baseUrl: string;
}

export function ShareDashboardButton({ initialToken, baseUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"normal" | "tv" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const url = token ? `${baseUrl}/call-agent/public/dashboard/${token}` : null;
  const tvUrl = token ? `${baseUrl}/call-agent/public/dashboard/${token}?tv=1` : null;

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

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
                Без логина. TV-режим — для большого экрана в офисе, обновляется каждые 30 сек.
              </p>
              <button onClick={gen} disabled={busy} className="ds-btn ds-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                {busy ? "Создаю..." : "Создать ссылку"}
              </button>
            </>
          ) : (
            <>
              {/* Обычная ссылка */}
              <div className="ds-body-sm" style={{ marginBottom: 4, fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                <Eye size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> Обычная
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
                <Tv size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> TV-режим (крупный текст, авто-обновление)
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

              <div style={{ display: "flex", gap: 4, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
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
