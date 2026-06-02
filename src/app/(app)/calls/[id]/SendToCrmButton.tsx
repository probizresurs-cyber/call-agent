"use client";

/**
 * Кнопка «Отправить в Bitrix» на карточке звонка.
 *
 * При нажатии — вызывает /api/calls/:id/send-to-crm и показывает превью результатов.
 * Если DRY_RUN=true — показывает что бы отправилось (с пометкой «симуляция»).
 * Если DRY_RUN=false — показывает реальный результат отправки.
 *
 * Видна только для роли owner/admin/head (определяется на server в page.tsx).
 */
import { useState } from "react";
import { Upload, CheckCircle2, XCircle, AlertCircle, Eye } from "lucide-react";

interface WriteResult {
  action: string;
  mode: "dry" | "live";
  status: "sent" | "skipped_dry" | "skipped_duplicate" | "failed" | "no_target";
  entityType: string | null;
  entityId: string | null;
  payload: unknown;
  result?: unknown;
  error?: string;
}

export function SendToCrmButton({ callId }: { callId: number }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<WriteResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<number | null>(null);

  async function send() {
    setBusy(true); setErr(null); setResults(null);
    try {
      const r = await fetch(`/call-agent/api/calls/${callId}/send-to-crm`, { method: "POST" });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "unknown");
      setResults(data.results as WriteResult[]);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 16, padding: 14, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: results || err ? 12 : 0 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <Upload size={14} strokeWidth={2} /> Отправить разбор в Bitrix24
          </div>
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 2 }}>
            Комментарий в Timeline всех связанных сущностей (сделка / лид / контакт)
            + резюме в карточку Activity.
          </div>
        </div>
        <button
          onClick={send}
          disabled={busy}
          className="ds-button"
          style={{ background: "var(--primary)", color: "white", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Отправка..." : "Отправить"}
        </button>
      </div>

      {err && (
        <div style={{
          padding: 8, background: "rgba(220,38,38,0.08)",
          border: "1px solid rgba(220,38,38,0.30)",
          borderRadius: 6, fontSize: 13, color: "var(--destructive)",
        }}>
          {err}
        </div>
      )}

      {results && results.length === 0 && (
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
          Нечего отправлять.
        </div>
      )}

      {results && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((r, i) => <ResultRow key={i} r={r} idx={i} expanded={showDetails === i} onToggle={() => setShowDetails(showDetails === i ? null : i)} />)}
          {results[0]?.mode === "dry" && (
            <div style={{
              marginTop: 6, padding: 10,
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.30)",
              borderRadius: 6, fontSize: 12,
            }}>
              <b>⚠ Это была симуляция.</b> Реально в Bitrix ничего не отправлено — включён DRY_RUN.
              Переключите в <a href="/call-agent/settings" style={{ color: "var(--primary)" }}>Настройках → Системные флаги</a>,
              когда будете готовы писать в продакшен-CRM клиента.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ r, idx, expanded, onToggle }: { r: WriteResult; idx: number; expanded: boolean; onToggle: () => void }) {
  const colors = {
    sent:               { bg: "rgba(34,197,94,0.08)", bd: "rgba(34,197,94,0.30)", fg: "var(--success)" },
    skipped_dry:        { bg: "rgba(245,158,11,0.08)", bd: "rgba(245,158,11,0.30)", fg: "var(--warning)" },
    skipped_duplicate:  { bg: "rgba(120,120,120,0.08)", bd: "rgba(120,120,120,0.30)", fg: "var(--muted-foreground)" },
    failed:             { bg: "rgba(220,38,38,0.08)", bd: "rgba(220,38,38,0.30)", fg: "var(--destructive)" },
    no_target:          { bg: "rgba(120,120,120,0.08)", bd: "rgba(120,120,120,0.30)", fg: "var(--muted-foreground)" },
  } as const;
  const c = colors[r.status];
  const Icon =
    r.status === "sent" ? CheckCircle2 :
    r.status === "failed" ? XCircle :
    AlertCircle;
  const label =
    r.status === "sent" ? "Отправлено" :
    r.status === "skipped_dry" ? "Симуляция" :
    r.status === "skipped_duplicate" ? "Уже отправлено ранее" :
    r.status === "failed" ? "Ошибка" : "Нет цели";

  const actionLabel = r.action === "comment" ? "Комментарий в Timeline" : r.action === "activity_update" ? "Описание активности" : "Задача";
  const entityLabel = r.entityType && r.entityId ? `${r.entityType} #${r.entityId}` : "—";

  return (
    <div style={{ padding: 10, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <Icon size={14} strokeWidth={2} color={c.fg} />
          <span style={{ fontWeight: 500 }}>{actionLabel}</span>
          <span style={{ color: "var(--muted-foreground)" }}>→ {entityLabel}</span>
          <span style={{ color: c.fg, fontWeight: 600 }}>· {label}</span>
        </div>
        <button onClick={onToggle} className="ds-button" style={{ fontSize: 11, padding: "2px 6px", background: "transparent", color: "var(--muted-foreground)" }}>
          <Eye size={11} strokeWidth={2} style={{ verticalAlign: -1, marginRight: 3 }} />
          {expanded ? "скрыть" : "превью"}
        </button>
      </div>
      {expanded && (
        <pre style={{
          marginTop: 8, padding: 10, background: "var(--background)",
          border: "1px solid var(--border)", borderRadius: 4,
          fontSize: 11, overflow: "auto", maxHeight: 400,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {JSON.stringify(r.payload, null, 2)}
          {r.result ? "\n\n--- result ---\n" + JSON.stringify(r.result, null, 2) : ""}
          {r.error ? "\n\n--- error ---\n" + r.error : ""}
        </pre>
      )}
    </div>
  );
}
