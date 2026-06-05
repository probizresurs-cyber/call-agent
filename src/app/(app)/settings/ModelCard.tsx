"use client";

/**
 * Карточка выбора AI-модели для анализа звонков.
 * Видно только owner/admin (isManager). Сохраняет в tenants.analysis_model.
 */
import { useState } from "react";
import { Bot } from "lucide-react";

const MODELS = [
  {
    value: null,
    label: "Авто (из настроек сервера)",
    price: null,
    description: "Модель выбирается автоматически на основе конфигурации сервера.",
  },
  {
    value: "openai:gpt-4o-mini",
    label: "GPT-4o mini",
    price: "~0.03 ₽/звонок",
    description: "Достаточно для большинства звонков. Экономит бюджет при большом объёме.",
  },
  {
    value: "openai:gpt-4o",
    label: "GPT-4o",
    price: "~4.6 ₽/звонок",
    description: "Стандартный уровень. Хорошо понимает контекст и чек-листы.",
  },
  {
    value: "anthropic:claude-haiku-4-5",
    label: "Claude Haiku",
    price: "~0.04 ₽/звонок",
    description: "Быстрый и экономный. Хуже с длинными диалогами.",
  },
  {
    value: "anthropic:claude-sonnet-4-6",
    label: "Claude Sonnet",
    price: "~5.9 ₽/звонок",
    description: "Наилучшее качество. Глубокий анализ нюансов разговора.",
  },
] as const;

type ModelValue = (typeof MODELS)[number]["value"];

export function ModelCard({ initial }: { initial: string | null }) {
  const [selected, setSelected] = useState<ModelValue>(
    (MODELS.find((m) => m.value === initial)?.value ?? null) as ModelValue
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setSaved(false);
    setErr(null);
    try {
      const res = await fetch("/call-agent/api/settings/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: selected }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || "unknown error");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: -4 }}>
        Выбор модели влияет на качество и стоимость анализа. Более слабые модели дешевле,
        но хуже понимают контекст.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MODELS.map((m) => {
          const isActive = selected === m.value;
          return (
            <label
              key={String(m.value)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`,
                borderRadius: 8,
                background: isActive ? "rgba(var(--primary-rgb, 99,102,241), 0.06)" : "var(--card)",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              <input
                type="radio"
                name="analysis-model"
                value={String(m.value)}
                checked={isActive}
                onChange={() => setSelected(m.value)}
                style={{ marginTop: 2, accentColor: "var(--primary)", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</span>
                  {m.price && (
                    <span className="ds-caption" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                      {m.price}
                    </span>
                  )}
                </div>
                <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 2 }}>
                  {m.description}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
        <button
          className="ds-button"
          onClick={save}
          disabled={busy}
          style={{
            background: "var(--primary)",
            color: "white",
            opacity: busy ? 0.6 : 1,
            minWidth: 110,
          }}
        >
          {busy ? "Сохранение..." : "Сохранить"}
        </button>

        {saved && (
          <span style={{ fontSize: 13, color: "var(--success, #16a34a)", fontWeight: 500 }}>
            Сохранено ✓
          </span>
        )}
      </div>

      {err && (
        <div
          style={{
            padding: 8,
            background: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.30)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--destructive)",
          }}
        >
          {err}
        </div>
      )}
    </div>
  );
}
