"use client";

/**
 * Карточка «Глоссарий названий».
 * AI (Whisper) распознаёт названия компаний на слух по-разному (Орлинг, Арлинк),
 * а нужно консистентно («Орлинк»). Здесь руководитель указывает правильные написания —
 * они подставляются в промпт анализатора и применяются во всех резюме/карточках.
 * Видно только owner/admin (isManager). Сохраняет в tenants.glossary.
 */
import { useState } from "react";
import { BookOpen } from "lucide-react";

const MAX_LEN = 5000;

const PLACEHOLDER = `Орлинк (не Орлинг, не Арлинк)
ГК Орлинк — полное название
названия продуктов, аббревиатуры...`;

export function GlossaryCard({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setSaved(false);
    setErr(null);
    try {
      const res = await fetch("/call-agent/api/settings/glossary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ glossary: value }),
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

  const overLimit = value.length > MAX_LEN;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <BookOpen size={18} strokeWidth={2} color="var(--muted-foreground)" style={{ marginTop: 2, flexShrink: 0 }} />
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", margin: 0 }}>
          AI иногда распознаёт названия компаний и терминов на слух неправильно.
          Укажите правильные написания — они будут применяться во всех резюме и карточках.
        </p>
      </div>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={6}
        spellCheck={false}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "10px 12px",
          border: `1px solid ${overLimit ? "var(--destructive)" : "var(--border)"}`,
          borderRadius: 8,
          background: "var(--card)",
          color: "var(--foreground)",
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily: "inherit",
        }}
      />

      <div className="ds-caption" style={{ color: overLimit ? "var(--destructive)" : "var(--muted-foreground)", fontSize: 12 }}>
        {value.length} / {MAX_LEN} символов
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4 }}>
        <button
          className="ds-button"
          onClick={save}
          disabled={busy || overLimit}
          style={{
            background: "var(--primary)",
            color: "white",
            opacity: busy || overLimit ? 0.6 : 1,
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
