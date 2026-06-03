"use client";

/**
 * Управление публичной ссылкой на дашборд.
 * Owner/admin могут сгенерировать, отозвать, перегенерировать.
 */
import { useState } from "react";
import { Share2, Copy, RotateCw, X, Tv, Eye } from "lucide-react";

interface Props {
  initialToken: string | null;
  baseUrl: string;   // например "https://marketradar24.ru"
}

export function DashboardShareCard({ initialToken, baseUrl }: Props) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = token ? `${baseUrl}/call-agent/public/dashboard/${token}` : null;
  const tvUrl = token ? `${baseUrl}/call-agent/public/dashboard/${token}?tv=1` : null;

  async function gen() {
    setBusy(true);
    try {
      const r = await fetch("/call-agent/api/dashboard-share", { method: "POST" });
      const data = await r.json();
      if (data.ok) setToken(data.token);
    } finally { setBusy(false); }
  }

  async function revoke() {
    if (!confirm("Отозвать ссылку? Все кто знают её перестанут видеть дашборд.")) return;
    setBusy(true);
    try {
      const r = await fetch("/call-agent/api/dashboard-share", { method: "DELETE" });
      if (r.ok) setToken(null);
    } finally { setBusy(false); }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
        Поделитесь дашбордом по публичной ссылке. Кто угодно с этой ссылкой увидит read-only KPI и таблицу менеджеров.
        Без логина. Можно повесить на телевизор в офисе через TV-режим.
      </p>

      {token ? (
        <>
          <div>
            <div className="ds-body-sm" style={{ marginBottom: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
              <Eye size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              Обычная ссылка
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                readOnly
                value={url ?? ""}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  flex: 1, padding: "8px 10px", fontSize: 13, fontFamily: "monospace",
                  background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4,
                }}
              />
              <button onClick={() => url && copy(url)} className="ds-btn ds-btn-secondary" style={{ minWidth: 100 }}>
                <Copy size={12} style={{ marginRight: 4 }} />
                {copied ? "Скопировано" : "Копировать"}
              </button>
            </div>
          </div>

          <div>
            <div className="ds-body-sm" style={{ marginBottom: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
              <Tv size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              TV-режим (крупный текст, обновление каждые 30 сек)
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                readOnly
                value={tvUrl ?? ""}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  flex: 1, padding: "8px 10px", fontSize: 13, fontFamily: "monospace",
                  background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4,
                }}
              />
              <a href={tvUrl ?? "#"} target="_blank" rel="noreferrer" className="ds-btn ds-btn-secondary" style={{ minWidth: 100, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Tv size={12} style={{ marginRight: 4 }} />
                Открыть
              </a>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={gen} disabled={busy} className="ds-btn ds-btn-secondary">
              <RotateCw size={12} style={{ marginRight: 4 }} />
              Перегенерировать
            </button>
            <button onClick={revoke} disabled={busy} className="ds-btn ds-btn-ghost" style={{ color: "var(--destructive)" }}>
              <X size={12} style={{ marginRight: 4 }} />
              Отозвать
            </button>
          </div>
        </>
      ) : (
        <button onClick={gen} disabled={busy} className="ds-btn ds-btn-primary" style={{ alignSelf: "flex-start" }}>
          <Share2 size={14} style={{ marginRight: 6 }} />
          {busy ? "Создаю..." : "Создать публичную ссылку"}
        </button>
      )}
    </div>
  );
}
