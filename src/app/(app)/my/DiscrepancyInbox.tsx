"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import type { CardDiscrepancy } from "@/lib/discrepancy-types";

export interface CardDiscrepancyRow extends CardDiscrepancy {
  started_at: string | null;
  manager_name: string | null;
}

interface Props {
  items: CardDiscrepancyRow[];
}

export function DiscrepancyInbox({ items: initial }: Props) {
  const [items, setItems] = useState(initial);

  if (items.length === 0) return null;

  async function resolve(id: number, action: "accepted" | "rejected") {
    try {
      const res = await fetch(`/call-agent/api/discrepancies/${id}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((d) => d.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert("Ошибка: " + (data.error ?? res.status));
      }
    } catch (e) {
      alert("Сетевая ошибка: " + (e as Error).message);
    }
  }

  return (
    <div className="ds-card" style={{ marginBottom: 16 }}>
      <h2
        className="ds-h3"
        style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}
      >
        <AlertCircle size={16} strokeWidth={2} color="var(--destructive)" />
        Расхождения — требуют проверки ({items.length})
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((d) => (
          <DiscrepancyCard key={d.id} d={d} onResolve={resolve} />
        ))}
      </div>
    </div>
  );
}

// ── Severity helpers ──

function severityColor(s: "low" | "medium" | "high"): string {
  if (s === "high") return "var(--destructive)";
  if (s === "medium") return "#ea580c";
  return "var(--warning)";
}

function severityLabel(s: "low" | "medium" | "high"): string {
  if (s === "high") return "Высокий";
  if (s === "medium") return "Средний";
  return "Низкий";
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

// ── Single card ──

function DiscrepancyCard({
  d,
  onResolve,
}: {
  d: CardDiscrepancyRow;
  onResolve: (id: number, action: "accepted" | "rejected") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"accepted" | "rejected" | null>(null);

  async function handle(action: "accepted" | "rejected") {
    setBusy(action);
    try {
      await onResolve(d.id, action);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--background)",
      }}
    >
      {/* Header: field + severity badge */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {d.field_label || d.field_name}
        </div>
        <span
          className="ds-badge"
          style={{
            fontSize: 10,
            padding: "2px 7px",
            borderRadius: 99,
            background: severityColor(d.severity) + "1a",
            color: severityColor(d.severity),
            border: `1px solid ${severityColor(d.severity)}40`,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {severityLabel(d.severity)}
        </span>
      </div>

      {/* Values */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
          <span style={{ fontWeight: 500 }}>В карточке:</span>{" "}
          <span>{d.card_value || "(пусто)"}</span>
        </div>
        <div className="ds-body-sm" style={{ fontSize: 12 }}>
          <span style={{ fontWeight: 500 }}>Предлагается:</span>{" "}
          <span style={{ color: "var(--success)", fontWeight: 600 }}>{d.suggested_value}</span>
        </div>
      </div>

      {/* Evidence */}
      {d.transcript_evidence && (
        <div
          className="ds-body-sm"
          style={{
            fontStyle: "italic",
            color: "var(--muted-foreground)",
            fontSize: 11,
            marginBottom: 10,
            paddingLeft: 8,
            borderLeft: "2px solid var(--border)",
          }}
        >
          {d.transcript_evidence}
        </div>
      )}

      {/* Footer: call link + buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/calls/${d.call_id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--primary)",
          }}
        >
          <ExternalLink size={11} />
          Звонок #{d.call_id}
          {d.started_at && (
            <span style={{ color: "var(--muted-foreground)" }}>
              · {formatDate(d.started_at)}
            </span>
          )}
          {d.manager_name && (
            <span style={{ color: "var(--muted-foreground)" }}>· {d.manager_name}</span>
          )}
        </Link>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="ds-button"
            disabled={busy !== null}
            onClick={() => handle("accepted")}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              background: busy === "accepted" ? "var(--success)" : "var(--success)",
              color: "white",
              opacity: busy !== null ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <CheckCircle2 size={12} />
            Принять
          </button>
          <button
            className="ds-button"
            disabled={busy !== null}
            onClick={() => handle("rejected")}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              background: "transparent",
              color: "var(--muted-foreground)",
              border: "1px solid var(--border)",
              opacity: busy !== null ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <XCircle size={12} />
            Отклонить
          </button>
        </div>
      </div>
    </div>
  );
}
