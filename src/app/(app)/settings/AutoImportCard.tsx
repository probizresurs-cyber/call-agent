"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

type Status = {
  enabled: boolean;
  last: { at: string | null; result: string | null };
};

export function AutoImportCard({ initial }: { initial: Status }) {
  const [status, setStatus] = useState<Status>(initial);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Раз в 30 секунд тихо обновляем статус (чтобы видеть свежий last)
  useEffect(() => {
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/call-agent/api/auto-import");
      const data = await r.json();
      if (data.ok) setStatus({ enabled: data.enabled, last: data.last });
    } catch {}
  }

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/call-agent/api/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await r.json();
      if (data.ok) setStatus({ enabled: data.enabled, last: data.last });
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    try {
      const r = await fetch("/call-agent/api/auto-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runNow: true }),
      });
      const data = await r.json();
      if (data.ok) {
        setStatus({ enabled: data.enabled, last: data.last });
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  }

  const lastAtFmt = status.last.at
    ? new Date(status.last.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
    : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Автоматический импорт</div>
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            Воркер проверяет Битрикс каждые 5 минут и подтягивает новые звонки
          </div>
        </div>

        {/* Toggle */}
        <button
          type="button"
          onClick={() => toggle(!status.enabled)}
          disabled={busy}
          style={{
            position: "relative",
            width: 44, height: 24, borderRadius: 12,
            background: status.enabled ? "var(--success)" : "var(--border)",
            border: "none", cursor: busy ? "wait" : "pointer",
            transition: "background 150ms",
          }}
          aria-label="Переключить автоимпорт"
        >
          <span style={{
            position: "absolute", top: 2, left: status.enabled ? 22 : 2,
            width: 20, height: 20, borderRadius: "50%",
            background: "#fff", transition: "left 150ms",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </button>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        padding: 12, background: "var(--muted)", borderRadius: 6, fontSize: 13,
      }}>
        <div>
          <div className="ds-caption" style={{ marginBottom: 4 }}>Последний запуск</div>
          <div>{lastAtFmt}</div>
        </div>
        <div>
          <div className="ds-caption" style={{ marginBottom: 4 }}>Результат</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            {status.last.result || "ещё не запускался"}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="ds-btn ds-btn-secondary"
        onClick={runNow}
        disabled={busy || !status.enabled}
        style={{ alignSelf: "flex-start" }}
      >
        {busy ? <Loader2 size={14} className="mr-spin" /> : <RefreshCw size={14} />}
        Запустить сейчас
      </button>
    </div>
  );
}
