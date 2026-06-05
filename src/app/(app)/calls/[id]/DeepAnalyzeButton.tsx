"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Microscope, ChevronDown } from "lucide-react";

const MODELS = [
  { value: "anthropic:claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "Лучшее качество" },
  { value: "anthropic:claude-opus-4-5",   label: "Claude Opus",        hint: "Максимальная глубина" },
  { value: "openai:gpt-4o",               label: "GPT-4o",             hint: "Альтернативный взгляд" },
];

export function DeepAnalyzeButton({ callId }: { callId: number }) {
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const router              = useRouter();
  const wrapRef             = useRef<HTMLDivElement>(null);

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

  async function run(model: string) {
    setOpen(false);
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(`/call-agent/api/calls/${callId}/deep-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
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
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        onClick={() => !busy && setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 14px",
          borderRadius: 7,
          border: "1px solid rgba(14,165,233,0.3)",
          background: "rgba(14,165,233,0.10)",
          color: "#0ea5e9",
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
          <Microscope size={15} strokeWidth={2} />
        )}
        Глубокий анализ
        {!busy && <ChevronDown size={13} strokeWidth={2} style={{ opacity: 0.7 }} />}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 50,
          minWidth: 220,
          background: "var(--card, #fff)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}>
          {MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => run(m.value)}
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
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>{m.label}</span>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{m.hint}</span>
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
