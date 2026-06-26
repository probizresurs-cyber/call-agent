"use client";

/**
 * ЗАДАЧА C: блок «Расхождения с CRM» в карточке звонка.
 *
 * Получает список расхождений по конкретному звонку (загружен server-side в page.tsx)
 * и рендерит их с доказательством, диффом значений, важностью, статусом и кнопками
 * «Принять» / «Отклонить» (тот же resolve API, что и в разделе /discrepancies).
 *
 * Если список пуст — компонент в page.tsx не рендерится (блок не показывается).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale, CheckCircle2, XCircle, Quote, ArrowRight } from "lucide-react";
import type { DiscrepancySeverity, DiscrepancyStatus } from "@/lib/discrepancy-types";

export interface CallDiscrepancyItem {
  id: number;
  field_name: string;
  field_label: string | null;
  card_value: string | null;
  suggested_value: string | null;
  transcript_evidence: string | null;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
}

const RESOLVED: DiscrepancyStatus[] = ["accepted", "rejected", "auto_applied", "manual_fixed"];

function severityLabel(s: DiscrepancySeverity): string {
  return s === "high" ? "Высокий" : s === "medium" ? "Средний" : "Низкий";
}
function severityColor(s: DiscrepancySeverity): string {
  return s === "high" ? "var(--destructive)" : s === "medium" ? "#ea580c" : "var(--warning)";
}

function StatusLabel({ status }: { status: string }) {
  if (status === "rejected")
    return (
      <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <XCircle size={13} /> Отклонено
      </span>
    );
  return (
    <span className="ds-body-sm" style={{ color: "var(--success)", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <CheckCircle2 size={13} />
      {status === "auto_applied" ? "Авто-применено" : status === "manual_fixed" ? "Исправлено вручную" : "Принято"}
    </span>
  );
}

function DiscrepancyCard({ item, actionMode }: { item: CallDiscrepancyItem; actionMode: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(item.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = RESOLVED.includes(status as DiscrepancyStatus);

  async function resolve(action: "accept" | "reject") {
    setLoading(true);
    setError(null);
    try {
      // ТРЕБОВАНИЕ: клиентский fetch с префиксом /call-agent/api/...
      const res = await fetch(`/call-agent/api/discrepancies/${item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action === "accept" ? "accepted" : "rejected" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const newStatus =
        action === "accept"
          ? actionMode === "auto_approve"
            ? "auto_applied"
            : "accepted"
          : "rejected";
      setStatus(newStatus);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: 12,
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Поле + важность + статус */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{item.field_label || item.field_name}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: severityColor(item.severity),
              border: `1px solid ${severityColor(item.severity)}`,
              borderRadius: 999,
              padding: "1px 8px",
            }}
          >
            {severityLabel(item.severity)}
          </span>
        </span>
      </div>

      {/* Текущее → предлагается */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
        <span
          style={{
            color: "var(--muted-foreground)",
            textDecoration: item.card_value ? "line-through" : undefined,
            wordBreak: "break-word",
          }}
        >
          {item.card_value || "— (пусто)"}
        </span>
        <ArrowRight size={14} color="var(--primary)" />
        <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{item.suggested_value || "—"}</span>
      </div>

      {/* Доказательство из разговора */}
      {item.transcript_evidence && (
        <blockquote
          style={{
            margin: 0,
            padding: "8px 10px",
            borderLeft: "3px solid var(--primary)",
            background: "var(--card)",
            borderRadius: 6,
            fontSize: 12,
            fontStyle: "italic",
            lineHeight: 1.5,
            color: "var(--foreground)",
            display: "flex",
            gap: 6,
            wordBreak: "break-word",
          }}
        >
          <Quote size={12} style={{ flexShrink: 0, marginTop: 2, color: "var(--muted-foreground)" }} />
          <span>«{item.transcript_evidence}»</span>
        </blockquote>
      )}

      {/* Действия / статус */}
      {isResolved ? (
        <StatusLabel status={status} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="ds-btn ds-btn-primary"
              disabled={loading}
              onClick={() => resolve("accept")}
              style={{ fontSize: 12, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <CheckCircle2 size={13} strokeWidth={2.5} /> Принять
            </button>
            <button
              type="button"
              className="ds-btn ds-btn-secondary"
              disabled={loading}
              onClick={() => resolve("reject")}
              style={{ fontSize: 12, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <XCircle size={13} strokeWidth={2.5} /> Отклонить
            </button>
          </div>
          {error && <span style={{ fontSize: 11, color: "var(--destructive)" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

export function CallDiscrepancies({
  items,
  actionMode,
}: {
  items: CallDiscrepancyItem[];
  actionMode: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="ds-card" style={{ marginBottom: 16 }}>
      <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Scale size={16} strokeWidth={2} color="var(--primary)" /> Расхождения с CRM
        <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>
          · {items.length}
        </span>
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => (
          <DiscrepancyCard key={item.id} item={item} actionMode={actionMode} />
        ))}
      </div>
    </div>
  );
}
