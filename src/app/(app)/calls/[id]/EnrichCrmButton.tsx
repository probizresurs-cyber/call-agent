"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EnrichCrmButton({ callId }: { callId: number }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const router = useRouter();

  async function go() {
    setBusy(true);
    setStatus("idle");
    setErrorText(null);
    try {
      const r = await fetch(`/call-agent/api/calls/${callId}/enrich`, { method: "POST" });
      const data = await r.json();
      if (!data.ok) {
        setStatus("error");
        setErrorText(data.error || "Ошибка обновления");
      } else {
        setStatus("ok");
        router.refresh();
      }
    } catch (e) {
      setStatus("error");
      setErrorText((e as Error).message || "Сетевая ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={go}
        disabled={busy}
        style={{
          fontSize: 12,
          padding: "2px 8px",
          background: "var(--muted)",
          color: "var(--muted-foreground)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          cursor: busy ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? (
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              border: "2px solid var(--muted-foreground)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
        ) : (
          <span style={{ fontSize: 13 }}>&#x21BB;</span>
        )}
        Обновить CRM
      </button>
      {status === "ok" && (
        <span style={{ fontSize: 12, color: "var(--success)" }}>&#x2713; Обновлено</span>
      )}
      {status === "error" && errorText && (
        <span style={{ fontSize: 12, color: "var(--destructive)" }}>{errorText}</span>
      )}
    </span>
  );
}
