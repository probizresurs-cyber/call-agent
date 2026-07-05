"use client";

/**
 * Кнопка «Сгруппировать по смыслу (AI)» / «Пересчитать категории» на странице
 * возражений. Дёргает /api/objections/recluster, затем обновляет страницу.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

export function ReclusterButton({ hasClusters }: { hasClusters: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/call-agent/api/objections/recluster", { method: "POST" });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "Не удалось сгруппировать"); return; }
      router.refresh();
    } catch {
      setErr("Ошибка запроса");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="ds-btn ds-btn-secondary"
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, opacity: busy ? 0.7 : 1 }}
        title="AI сгруппирует похожие возражения по смыслу (Цена/Дорого/Высокая стоимость → одна категория)"
      >
        {busy ? <span className="spinner" /> : <Sparkles size={15} />}
        {busy ? "Группирую…" : hasClusters ? "Пересчитать категории (AI)" : "Сгруппировать по смыслу (AI)"}
      </button>
      {err && <span className="ds-body-sm" style={{ color: "var(--destructive)", fontSize: 12 }}>{err}</span>}
    </div>
  );
}
