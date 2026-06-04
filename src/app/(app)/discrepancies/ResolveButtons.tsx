"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import type { DiscrepancyStatus } from "@/lib/discrepancy-types";

interface Props {
  discrepancyId: number;
  currentStatus: string;
  actionMode: string;
}

const RESOLVED_STATUSES: DiscrepancyStatus[] = [
  "accepted",
  "rejected",
  "auto_applied",
  "manual_fixed",
];

function StatusBadgeInline({ status }: { status: string }) {
  if (status === "accepted" || status === "auto_applied")
    return (
      <span
        className="ds-badge ds-badge-success"
        style={{
          paddingLeft: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontStyle: status === "auto_applied" ? "italic" : undefined,
        }}
      >
        <CheckCircle2 size={11} strokeWidth={2.5} />
        {status === "auto_applied" ? "Авто-применено" : "Принято"}
      </span>
    );
  if (status === "rejected")
    return (
      <span
        className="ds-badge"
        style={{
          paddingLeft: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "var(--muted)",
          color: "var(--muted-foreground)",
        }}
      >
        <XCircle size={11} strokeWidth={2.5} />
        Отклонено
      </span>
    );
  if (status === "manual_fixed")
    return (
      <span
        className="ds-badge ds-badge-success"
        style={{ paddingLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <CheckCircle2 size={11} strokeWidth={2.5} />
        Исправлено вручную
      </span>
    );
  return null;
}

export function ResolveButtons({ discrepancyId, currentStatus, actionMode }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = RESOLVED_STATUSES.includes(status as DiscrepancyStatus);

  if (isResolved) {
    return <StatusBadgeInline status={status} />;
  }

  async function resolve(action: "accept" | "reject") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/discrepancies/${discrepancyId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Update optimistic status
      const newStatus: string =
        action === "accept"
          ? actionMode === "auto_approve"
            ? "auto_applied"
            : "accepted"
          : "rejected";
      setStatus(data?.status ?? newStatus);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          className="ds-btn ds-btn-primary"
          onClick={() => resolve("accept")}
          disabled={loading}
          style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
          title="Принять расхождение — применить в CRM"
        >
          <CheckCircle2 size={13} strokeWidth={2.5} />
          Принять
        </button>
        <button
          type="button"
          className="ds-btn ds-btn-secondary"
          onClick={() => resolve("reject")}
          disabled={loading}
          style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
          title="Отклонить — оставить карточку без изменений"
        >
          <XCircle size={13} strokeWidth={2.5} />
          Отклонить
        </button>
      </div>
      {error && (
        <span style={{ fontSize: 11, color: "var(--destructive)" }}>{error}</span>
      )}
    </div>
  );
}
