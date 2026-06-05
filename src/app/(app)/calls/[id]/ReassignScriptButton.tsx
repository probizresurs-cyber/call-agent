"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ChevronDown } from "lucide-react";

const SCRIPT_OPTIONS = [
  { value: "МП", label: "МП — Менеджер продаж",        hint: "Металлопрокат, поставки" },
  { value: "МК", label: "МК — Менеджер-консультант",   hint: "Металлоконструкции, строительство" },
  { value: "",   label: "Авто (по чек-листу)",          hint: "AI определит тип самостоятельно" },
];

export function ReassignScriptButton({ callId }: { callId: number }) {
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router            = useRouter();
  const wrapRef           = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function run(scriptProduct: string) {
    setOpen(false);
    setError(null);
    setBusy(true);
    try {
      const url = scriptProduct
        ? `/call-agent/api/calls/${callId}/process?script_product=${encodeURIComponent(scriptProduct)}`
        : `/call-agent/api/calls/${callId}/process`;
      const r = await fetch(url, { method: "POST" });
      const data = await r.json();
      if (!data.ok) {
        setError(data.error || "Неизвестная ошибка");
      } else {
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}
    >
      <button
        onClick={() => !busy && setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          borderRadius: 7,
          border: "1px solid rgba(120,120,120,0.25)",
          background: "rgba(120,120,120,0.08)",
          color: "var(--muted-foreground)",
          fontWeight: 600,
          fontSize: 14,
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.7 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {busy ? (
          <span className="spinner" style={{ width: 14, height: 14 }} />
        ) : (
          <RefreshCw size={14} strokeWidth={2} />
        )}
        Переоценить
        {!busy && <ChevronDown size={13} strokeWidth={2} style={{ opacity: 0.6 }} />}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 50,
          minWidth: 240,
          background: "var(--card, #fff)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "8px 14px 6px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--muted-foreground)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            borderBottom: "1px solid var(--border)",
          }}>
            Тип скрипта
          </div>
          {SCRIPT_OPTIONS.map((opt) => (
            <button
              key={opt.value || "__auto__"}
              onClick={() => run(opt.value)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                width: "100%",
                padding: "10px 14px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--muted)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>{opt.label}</span>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{opt.hint}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "var(--destructive)", maxWidth: 260, textAlign: "right" }}>
          {error}
        </div>
      )}
    </div>
  );
}
