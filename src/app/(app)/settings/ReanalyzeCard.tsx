"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";

export function ReanalyzeCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reset: number; pendingNow: number } | null>(null);
  const router = useRouter();

  async function run(onlyDone: boolean) {
    if (!confirm(
      onlyDone
        ? "Сбросить ВСЕ успешно обработанные звонки в очередь для переанализа? Они будут заново прогнаны через Claude с актуальными скриптами. Whisper повторно НЕ запускается (используем сохранённые транскрипты)."
        : "Сбросить done + failed звонки на переанализ?"
    )) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/call-agent/api/calls/reanalyze-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyDone }),
      });
      const data = await r.json();
      if (data.ok) {
        setResult({ reset: data.reset, pendingNow: data.pendingNow });
        router.refresh();
      } else {
        alert("Ошибка: " + data.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
        Прогонит все звонки с готовыми транскриптами через Claude заново — с актуальными
        скриптами и чек-листами. Полезно после изменения скриптов или порогов.
        <br />
        <b>Whisper повторно не запускается</b> — используются сохранённые транскрипты, экономия ~75% стоимости.
        ≈$0.01 за звонок (только Claude).
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" className="ds-btn ds-btn-primary"
          onClick={() => run(true)} disabled={busy}>
          {busy ? <Loader2 size={14} className="mr-spin" /> : <RotateCcw size={14} />}
          Переанализировать все done звонки
        </button>
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={() => run(false)} disabled={busy}>
          Переанализировать done + failed
        </button>
      </div>
      {result && (
        <div className="ds-card" style={{
          marginTop: 12,
          background: "rgba(31,157,85,0.08)",
          borderColor: "rgba(31,157,85,0.30)",
          fontSize: 13,
        }}>
          ✓ Сброшено в очередь: <b>{result.reset}</b>.
          Сейчас в pending: <b>{result.pendingNow}</b>.
          Воркер начнёт обрабатывать сразу. Иди в Дашборд через 5-10 минут — увидишь как
          обновляются метрики с новыми скриптами.
        </div>
      )}
    </>
  );
}
