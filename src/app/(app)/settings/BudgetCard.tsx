"use client";

/**
 * Карточка бюджет-гарда (§4.4 MASTER-TZ).
 * Показывает: текущий расход за месяц, лимиты, поведение при превышении.
 * Меняется только owner/admin (но в UI не блокируем — проверка на сервере).
 */
import { useState } from "react";
import { Coins, AlertTriangle } from "lucide-react";

export interface BudgetInitial {
  budget: {
    maxAnthropicTokens: number | null;
    maxOpenaiSeconds: number | null;
    action: "stop" | "notify_only";
  };
  usage: {
    anthropicTokens: number;
    openaiSeconds: number;
    periodStart: string;
  };
}

export function BudgetCard({ initial }: { initial: BudgetInitial }) {
  const [tokens, setTokens] = useState<string>(initial.budget.maxAnthropicTokens?.toString() ?? "");
  const [seconds, setSeconds] = useState<string>(initial.budget.maxOpenaiSeconds?.toString() ?? "");
  const [action, setAction] = useState<"stop" | "notify_only">(initial.budget.action);
  const [usage, setUsage] = useState(initial.usage);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/call-agent/api/budget", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          maxAnthropicTokens: tokens.trim() === "" ? null : parseInt(tokens, 10),
          maxOpenaiSeconds:   seconds.trim() === "" ? null : parseInt(seconds, 10),
          action,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "unknown");
      setUsage(data.usage);
      setMsg("Сохранено");
    } catch (e) {
      setMsg("Ошибка: " + (e as Error).message);
    } finally { setBusy(false); }
  }

  const tokensLimit = tokens.trim() === "" ? null : parseInt(tokens, 10);
  const secondsLimit = seconds.trim() === "" ? null : parseInt(seconds, 10);
  const tokensPct = tokensLimit && tokensLimit > 0 ? (usage.anthropicTokens / tokensLimit) * 100 : 0;
  const secondsPct = secondsLimit && secondsLimit > 0 ? (usage.openaiSeconds / secondsLimit) * 100 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Текущий расход */}
      <div>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 8 }}>
          Расход с {formatDate(usage.periodStart)} (текущий месяц)
        </div>

        <UsageRow
          label="Anthropic — токены"
          value={`${formatNum(usage.anthropicTokens)} токенов`}
          limit={tokensLimit}
          pct={tokensPct}
          hint={tokensLimit ? `~$${((usage.anthropicTokens / 1_000_000) * 9).toFixed(2)} по тарифу Sonnet 4.6 mix` : "лимит не задан"}
        />

        <UsageRow
          label="OpenAI Whisper — минуты"
          value={`${formatDuration(usage.openaiSeconds)}`}
          limit={secondsLimit}
          pct={secondsPct}
          hint={secondsLimit ? `~$${((usage.openaiSeconds / 60) * 0.006).toFixed(2)} по тарифу $0.006/мин` : "лимит не задан"}
        />
      </div>

      {/* Настройки лимитов */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div className="ds-body-sm" style={{ fontWeight: 600, marginBottom: 10 }}>Лимиты на месяц</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Field
            label="Anthropic токенов/мес"
            placeholder="пусто = без лимита"
            value={tokens}
            onChange={setTokens}
            hint="Один анализ звонка ≈ 5 000-8 000 токенов. 5 млн = ~700 звонков."
          />
          <Field
            label="OpenAI Whisper секунд/мес"
            placeholder="пусто = без лимита"
            value={seconds}
            onChange={setSeconds}
            hint="Минута Whisper = 60 сек. 100 000 сек ≈ 1666 мин ≈ 333 звонка по 5 мин."
          />
          <div>
            <div className="ds-body-sm" style={{ marginBottom: 6, color: "var(--muted-foreground)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Поведение при превышении
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <RadioBtn checked={action === "stop"} onClick={() => setAction("stop")} label="Остановить обработку" />
              <RadioBtn checked={action === "notify_only"} onClick={() => setAction("notify_only")} label="Только уведомить" />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="ds-body-sm" style={{ color: msg?.startsWith("Ошибка") ? "var(--destructive)" : "var(--muted-foreground)" }}>
          {msg ?? " "}
        </span>
        <button onClick={save} disabled={busy} className="ds-button" style={{ background: "var(--primary)", color: "white", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

// ── Subcomponents ──

function UsageRow({ label, value, limit, pct, hint }: {
  label: string; value: string; limit: number | null; pct: number; hint?: string;
}) {
  const warn = pct >= 80;
  const exceeded = pct >= 100;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>{label}</span>
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: exceeded ? "var(--destructive)" : warn ? "var(--warning)" : "inherit"
        }}>
          {value}
          {limit && (
            <span style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 6 }}>
              / {formatNum(limit)} ({pct.toFixed(0)}%)
            </span>
          )}
        </span>
      </div>
      {limit && (
        <div style={{ height: 6, background: "var(--muted)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            background: exceeded ? "var(--destructive)" : warn ? "var(--warning)" : "var(--primary)",
            transition: "width 200ms"
          }} />
        </div>
      )}
      {hint && <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <div className="ds-body-sm" style={{ marginBottom: 4, fontSize: 12 }}>{label}</div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="ds-input"
        style={{ width: "100%", padding: "6px 10px", fontSize: 13 }}
      />
      {hint && <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function RadioBtn({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="ds-button"
      style={{
        background: checked ? "var(--primary)" : "transparent",
        color: checked ? "white" : "var(--foreground)",
        border: `1px solid ${checked ? "var(--primary)" : "var(--border)"}`,
        fontSize: 12,
      }}
    >
      {checked && <Coins size={12} strokeWidth={2} style={{ marginRight: 4, verticalAlign: -1 }} />}
      {label}
    </button>
  );
}

// ── Helpers ──

function formatNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} мин ${s} сек`;
}

function formatDate(s: string): string {
  return s.split("-").reverse().join(".");
}
