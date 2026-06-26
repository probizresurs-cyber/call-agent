"use client";

/**
 * ЗАДАЧА B: детальный просмотр одного расхождения.
 *
 * Раскрывающаяся панель под строкой таблицы. Показывает РОПу всё, на основании
 * чего система решила, что есть расхождение:
 *  - поле (человекочитаемо) + важность;
 *  - текущее в CRM → предлагается;
 *  - доказательство из разговора (цитата) — ключевое;
 *  - дата звонка, менеджер, ссылка на звонок и на карточку Bitrix;
 *  - кнопки «Принять» / «Отклонить» (тот же resolve API).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Quote,
  ArrowRight,
} from "lucide-react";
import type { DiscrepancySeverity, DiscrepancyStatus } from "@/lib/discrepancy-types";

export interface DiscrepancyDetailData {
  id: number;
  call_id: number;
  entity_type: string | null;
  entity_id: string | null;
  field_name: string;
  field_label: string | null;
  card_value: string | null;
  suggested_value: string | null;
  transcript_evidence: string | null;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
  created_at: string;
  started_at: string | null;
  manager_name: string | null;
  manager_id: string | null;
  bitrix_portal_url: string | null;
  actionMode: string;
}

const RESOLVED: DiscrepancyStatus[] = ["accepted", "rejected", "auto_applied", "manual_fixed"];

function formatDate(s: string | null): string {
  if (!s) return "—";
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function severityLabel(s: DiscrepancySeverity): string {
  return s === "high" ? "Высокий" : s === "medium" ? "Средний" : "Низкий";
}

function severityColor(s: DiscrepancySeverity): string {
  return s === "high" ? "var(--destructive)" : s === "medium" ? "#ea580c" : "var(--warning)";
}

/** Безопасная ссылка на карточку Bitrix (только https) */
function bitrixCardUrl(
  portalUrl: string | null,
  entityType: string | null,
  entityId: string | null
): string | null {
  if (!portalUrl || !entityType || !entityId) return null;
  try {
    const p = new URL(portalUrl);
    if (p.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const path =
    entityType === "deal"
      ? `crm/deal/details/${entityId}/`
      : entityType === "lead"
      ? `crm/lead/details/${entityId}/`
      : entityType === "contact"
      ? `crm/contact/details/${entityId}/`
      : null;
  if (!path) return null;
  return `${portalUrl.replace(/\/$/, "")}/${path}`;
}

export function DiscrepancyDetail({ data }: { data: DiscrepancyDetailData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>(data.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = RESOLVED.includes(status as DiscrepancyStatus);
  const crmUrl = bitrixCardUrl(data.bitrix_portal_url, data.entity_type, data.entity_id);

  async function resolve(action: "accept" | "reject") {
    setLoading(true);
    setError(null);
    try {
      // ТРЕБОВАНИЕ: клиентский fetch с префиксом /call-agent/api/...
      const res = await fetch(`/call-agent/api/discrepancies/${data.id}/resolve`, {
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
          ? data.actionMode === "auto_approve"
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
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ds-btn ds-btn-secondary"
        style={{
          fontSize: 12,
          padding: "4px 10px",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
        title="Показать детали расхождения"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Подробнее
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            padding: 16,
            background: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            maxWidth: 720,
          }}
        >
          {/* Заголовок: поле + важность */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {data.field_label || data.field_name}
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: severityColor(data.severity),
                border: `1px solid ${severityColor(data.severity)}`,
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              Важность: {severityLabel(data.severity)}
            </span>
          </div>

          {/* Текущее → предлагается */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div className="ds-caption" style={{ marginBottom: 4 }}>Сейчас в CRM</div>
              <div
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--muted-foreground)",
                  textDecoration: data.card_value ? "line-through" : undefined,
                  wordBreak: "break-word",
                }}
              >
                {data.card_value || "— (пусто)"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", paddingTop: 18 }}>
              <ArrowRight size={18} color="var(--primary)" />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div className="ds-caption" style={{ marginBottom: 4 }}>Предлагается</div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 10px",
                  background: "var(--card)",
                  border: "1px solid var(--primary)",
                  borderRadius: 6,
                  color: "var(--foreground)",
                  wordBreak: "break-word",
                }}
              >
                {data.suggested_value || "—"}
              </div>
            </div>
          </div>

          {/* Доказательство из разговора — ключевое */}
          <div>
            <div className="ds-caption" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Quote size={12} /> Доказательство из разговора
            </div>
            {data.transcript_evidence ? (
              <blockquote
                style={{
                  margin: 0,
                  padding: "10px 12px",
                  borderLeft: "3px solid var(--primary)",
                  background: "var(--card)",
                  borderRadius: 6,
                  fontSize: 13,
                  fontStyle: "italic",
                  lineHeight: 1.5,
                  color: "var(--foreground)",
                  wordBreak: "break-word",
                }}
              >
                «{data.transcript_evidence}»
              </blockquote>
            ) : (
              <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
                Доказательство не указано.
              </div>
            )}
          </div>

          {/* Метаданные: дата, менеджер, ссылки */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              fontSize: 12,
              color: "var(--muted-foreground)",
            }}
          >
            <span>Дата звонка: <b style={{ color: "var(--foreground)" }}>{formatDate(data.started_at)}</b></span>
            <span>
              Менеджер:{" "}
              <b style={{ color: "var(--foreground)" }}>
                {data.manager_name || (data.manager_id ? `ID ${data.manager_id}` : "—")}
              </b>
            </span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <Link
              href={`/calls/${data.call_id}`}
              className="ds-body-sm"
              style={{ color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <ExternalLink size={13} /> Открыть звонок #{data.call_id}
            </Link>
            {crmUrl && (
              <a
                href={crmUrl}
                target="_blank"
                rel="noreferrer"
                className="ds-body-sm"
                style={{ color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <ExternalLink size={13} /> Карточка в Bitrix
              </a>
            )}
          </div>

          {/* Действия */}
          {isResolved ? (
            <div
              className="ds-body-sm"
              style={{ color: "var(--muted-foreground)", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {status === "rejected" ? (
                <>
                  <XCircle size={14} /> Отклонено
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} color="var(--success)" />
                  {status === "auto_applied" ? "Авто-применено" : status === "manual_fixed" ? "Исправлено вручную" : "Принято"}
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="ds-btn ds-btn-primary"
                  disabled={loading}
                  onClick={() => resolve("accept")}
                  style={{ fontSize: 13, padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <CheckCircle2 size={14} strokeWidth={2.5} /> Принять
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn-secondary"
                  disabled={loading}
                  onClick={() => resolve("reject")}
                  style={{ fontSize: 13, padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <XCircle size={14} strokeWidth={2.5} /> Отклонить
                </button>
              </div>
              {error && <span style={{ fontSize: 12, color: "var(--destructive)" }}>{error}</span>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
