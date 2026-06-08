"use client";

import { useState } from "react";
import { FileText, Send, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

// ── Хелперы дат (те же правила, что в DashboardFilters: неделя с понедельника) ──
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function today(): Date {
  return new Date();
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface Preset {
  key: string;
  label: string;
  /** null/null => «За всё время» */
  range: () => { from: string | null; to: string | null };
}

const PRESETS: Preset[] = [
  { key: "today", label: "Сегодня", range: () => { const t = isoDate(today()); return { from: t, to: t }; } },
  { key: "yesterday", label: "Вчера", range: () => { const d = today(); d.setDate(d.getDate() - 1); const s = isoDate(d); return { from: s, to: s }; } },
  { key: "this_week", label: "Эта неделя", range: () => ({ from: isoDate(startOfWeek(today())), to: isoDate(today()) }) },
  {
    key: "last_week", label: "Прошлая неделя",
    range: () => {
      const start = startOfWeek(today());
      const lastEnd = new Date(start); lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfWeek(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    },
  },
  { key: "this_month", label: "Этот месяц", range: () => ({ from: isoDate(startOfMonth(today())), to: isoDate(today()) }) },
  {
    key: "last_month", label: "Прошлый месяц",
    range: () => {
      const s = startOfMonth(today());
      const lastEnd = new Date(s); lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfMonth(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    },
  },
  { key: "all", label: "За всё время", range: () => ({ from: null, to: null }) },
];

interface ManagerOption {
  id: string;
  name: string;
}

type Scope = "manager" | "team";

interface SendResultRow {
  recipient: string;
  recipientName?: string;
  ok: boolean;
  mode?: "live" | "dry";
  messageId?: number;
  error?: string;
}

export function ReportsClient({ managers, recipients }: { managers: ManagerOption[]; recipients: ManagerOption[] }) {
  const [scope, setScope] = useState<Scope>("manager");
  const [managerId, setManagerId] = useState<string>(managers[0]?.id ?? "");
  // «Кому отправить»: "" = по умолчанию (manager → самому менеджеру; team → всем РОПам).
  // Иначе — отправляем выбранному получателю, независимо от того, про кого отчёт.
  const [recipientId, setRecipientId] = useState<string>("");
  const [presetKey, setPresetKey] = useState<string>("this_month");

  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<
    { sent: number; total: number; dry: boolean; results: SendResultRow[] } | null
  >(null);

  const activePreset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];
  const periodLabel = activePreset.label;

  function buildBody() {
    const { from, to } = activePreset.range();
    return {
      scope,
      managerId: scope === "manager" ? managerId : undefined,
      recipientId: recipientId || undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      periodLabel,
    };
  }

  function validate(): string | null {
    if (scope === "manager" && !managerId) {
      return "Выберите менеджера для персонального отчёта";
    }
    return null;
  }

  async function doPreview() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSendInfo(null);
    setPreviewing(true);
    try {
      const res = await fetch("/call-agent/api/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Не удалось сформировать отчёт");
        setPreview(null);
      } else {
        setPreview({ title: data.title, text: data.text });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function doSend() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSendInfo(null);
    setSending(true);
    try {
      const res = await fetch("/call-agent/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (!res.ok && !data.results) {
        setError(data.error || "Не удалось отправить отчёт");
      } else {
        setSendInfo({
          sent: data.sent ?? 0,
          total: data.total ?? (data.results?.length ?? 0),
          dry: !!data.dry,
          results: data.results ?? [],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSending(false);
    }
  }

  const busy = previewing || sending;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="ds-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={24} strokeWidth={2} />
          Отчёты
        </h1>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 6 }}>
          Сформируйте отчёт за период и отправьте менеджерам в Bitrix-мессенджер.
        </p>
      </div>

      <div className="ds-card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* ── Тип отчёта ── */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Тип отчёта</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {([
              { val: "manager" as Scope, label: "По менеджеру", hint: "персональный" },
              { val: "team" as Scope, label: "Общий по команде", hint: "" },
            ]).map((opt) => {
              const active = scope === opt.val;
              return (
                <label
                  key={opt.val}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", borderRadius: 8, cursor: busy ? "wait" : "pointer",
                    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                    background: active ? "color-mix(in oklch, var(--primary) 12%, var(--card))" : "var(--card)",
                    color: active ? "var(--primary)" : "var(--foreground)",
                    fontWeight: active ? 600 : 500, fontSize: 14,
                  }}
                >
                  <input
                    type="radio"
                    name="report-scope"
                    checked={active}
                    disabled={busy}
                    onChange={() => { setScope(opt.val); setSendInfo(null); }}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  {opt.label}
                  {opt.hint && (
                    <span style={{ color: "var(--muted-foreground)", fontWeight: 400, fontSize: 12 }}>
                      ({opt.hint})
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* ── Выбор менеджера (только для scope=manager) ── */}
        {scope === "manager" && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Менеджер</div>
            {managers.length === 0 ? (
              <p className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
                Нет менеджеров с привязкой к Bitrix.
              </p>
            ) : (
              <select
                className="ds-input"
                value={managerId}
                disabled={busy}
                onChange={(e) => { setManagerId(e.target.value); setSendInfo(null); }}
                style={{ maxWidth: 360 }}
              >
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ── Период ── */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Период</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                onClick={() => { setPresetKey(p.key); setSendInfo(null); }}
                className={`ds-btn ${presetKey === p.key ? "ds-btn-primary" : "ds-btn-secondary"}`}
                style={{ height: 32, padding: "0 12px", fontSize: 13, whiteSpace: "nowrap" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Кому отправить (получатель) ── */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Кому отправить</div>
          <select
            className="ds-input"
            value={recipientId}
            disabled={busy}
            onChange={(e) => { setRecipientId(e.target.value); setSendInfo(null); }}
            style={{ maxWidth: 360 }}
          >
            <option value="">
              {scope === "manager"
                ? "По умолчанию — самому менеджеру"
                : "По умолчанию — всем РОПам / владельцам"}
            </option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>{r.name || `ID ${r.id}`}</option>
            ))}
          </select>
          <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 6 }}>
            Выберите получателя, чтобы отправить отчёт конкретному человеку (например, РОПу) —
            независимо от того, про кого отчёт. Только превью получателя не учитывает.
          </p>
        </div>

        {/* ── Действия ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={doPreview}
            disabled={busy}
            className="ds-btn ds-btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {previewing ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}
            Сформировать превью
          </button>
          <button
            type="button"
            onClick={doSend}
            disabled={busy}
            className="ds-btn ds-btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            Отправить в Bitrix
          </button>
        </div>

        {/* ── Ошибка ── */}
        {error && (
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
              borderRadius: 8, fontSize: 14,
              border: "1px solid var(--destructive)",
              background: "color-mix(in oklch, var(--destructive) 10%, var(--card))",
              color: "var(--destructive)",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Результат отправки ── */}
        {sendInfo && (
          <div
            style={{
              padding: "12px 14px", borderRadius: 8, fontSize: 14,
              border: `1px solid ${sendInfo.sent > 0 ? "var(--primary)" : "var(--destructive)"}`,
              background: sendInfo.sent > 0
                ? "color-mix(in oklch, var(--primary) 8%, var(--card))"
                : "color-mix(in oklch, var(--destructive) 8%, var(--card))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              {sendInfo.sent > 0
                ? <CheckCircle2 size={16} style={{ color: "var(--primary)" }} />
                : <AlertCircle size={16} style={{ color: "var(--destructive)" }} />}
              {sendInfo.dry
                ? `Тестовый режим (dry-run): сообщения НЕ отправлены в Bitrix. Обработано ${sendInfo.total}.`
                : `Отправлено: ${sendInfo.sent} из ${sendInfo.total}`}
            </div>
            {sendInfo.dry && (
              <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 4 }}>
                Включён DRY_RUN — отправка в Bitrix отключена. Снимите флаг на сервере, чтобы слать вживую.
              </p>
            )}
            {sendInfo.results.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                {sendInfo.results.map((r, i) => (
                  <li key={i} style={{ fontSize: 13, color: r.ok ? "var(--foreground)" : "var(--destructive)" }}>
                    {r.recipientName || `Bitrix ID ${r.recipient}`}
                    {" — "}
                    {r.ok
                      ? (r.mode === "dry" ? "подготовлено (dry)" : "отправлено")
                      : `ошибка: ${r.error || "неизвестно"}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Превью текста ── */}
        {preview && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>
              Превью {preview.title ? `— ${preview.title}` : ""}
            </div>
            <textarea
              className="ds-textarea"
              readOnly
              value={preview.text}
              style={{ width: "100%", minHeight: 280, fontFamily: "var(--font-mono, monospace)", fontSize: 13, lineHeight: 1.5 }}
            />
          </div>
        )}
      </div>

      <style>{`.spin{animation:reports-spin 0.8s linear infinite}@keyframes reports-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
