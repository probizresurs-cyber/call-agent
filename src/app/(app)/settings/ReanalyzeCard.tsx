"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2, Users as UsersIcon } from "lucide-react";

export function ReanalyzeCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reset: number; pendingNow: number } | null>(null);
  const [reattribResult, setReattribResult] = useState<{ processed: number; updated: number; unchanged: number } | null>(null);
  const [reattribBusy, setReattribBusy] = useState(false);
  const router = useRouter();

  async function reattribute() {
    const fromDate = prompt("С какой даты пересчитать атрибуцию менеджеров? (YYYY-MM-DD)", "2026-05-25");
    if (!fromDate) return;
    const toDate = prompt("По какую дату?", "2026-06-01");
    if (!toDate) return;
    setReattribBusy(true);
    setReattribResult(null);
    try {
      const r = await fetch("/call-agent/api/calls/reattribute-managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate }),
      });
      const data = await r.json();
      if (data.ok) {
        setReattribResult({ processed: data.processed, updated: data.updated, unchanged: data.unchanged });
        router.refresh();
      } else {
        alert("Ошибка: " + data.error);
      }
    } finally {
      setReattribBusy(false);
    }
  }

  async function run(mode: "done" | "failed" | "all") {
    const msg =
      mode === "done"
        ? "Пересчитать анализ всех уже обработанных звонков? Разбор нейросетью пройдёт заново с актуальными скриптами. Расшифровку звонка при этом повторно делать не будем — используем уже сохранённый текст."
        : mode === "failed"
        ? "Повторить обработку всех звонков с ошибкой? Это в основном те, что не прошли из-за временного сбоя. Если расшифровка уже есть — повторно делать её не будем."
        : "Пересчитать анализ обработанных звонков и повторить те, что с ошибкой?";
    if (!confirm(msg)) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/call-agent/api/calls/reanalyze-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
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
        Заново разберёт нейросетью все звонки, у которых уже есть расшифровка — с актуальными
        скриптами и чек-листами. Полезно, если вы поменяли скрипт продаж или правила проверки.
        <br />
        Саму расшифровку звонка заново делать не будем — используем уже сохранённую.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ds-btn ds-btn-primary"
          onClick={() => run("done")} disabled={busy}>
          {busy ? <Loader2 size={14} className="mr-spin" /> : <RotateCcw size={14} />}
          Переанализировать готовые
        </button>
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={() => run("failed")} disabled={busy}>
          <RotateCcw size={14} /> Только с ошибкой
        </button>
        <button type="button" className="ds-btn ds-btn-ghost"
          onClick={() => run("all")} disabled={busy}>
          Готовые + с ошибкой
        </button>
      </div>
      {result && (
        <div className="ds-card" style={{
          marginTop: 12,
          background: "rgba(31,157,85,0.08)",
          borderColor: "rgba(31,157,85,0.30)",
          fontSize: 13,
        }}>
          ✓ Поставлено в очередь: <b>{result.reset}</b>.
          Сейчас ожидают обработки: <b>{result.pendingNow}</b>.
          Обработка начнётся сразу — загляните в Дашборд через 5–10 минут,
          увидите обновлённые метрики.
        </div>
      )}

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "20px 0" }} />

      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 8 }}>
        <b>Пересчёт закреплённого менеджера</b> — сверяем с Битриксом, кто по факту ведёт
        каждую сделку, и обновляем менеджера у нас, если он изменился. Полезно, если в Битриксе
        звонок сначала приходит диспетчеру, а сделку в работу берёт другой менеджер.
      </p>
      <button type="button" className="ds-btn ds-btn-secondary"
        onClick={reattribute} disabled={reattribBusy}>
        {reattribBusy ? <Loader2 size={14} className="mr-spin" /> : <UsersIcon size={14} />}
        Пересчитать закреплённого менеджера
      </button>
      {reattribResult && (
        <div className="ds-card" style={{
          marginTop: 12,
          background: "rgba(91,79,199,0.08)",
          borderColor: "rgba(91,79,199,0.30)",
          fontSize: 13,
        }}>
          ✓ Проверено звонков: <b>{reattribResult.processed}</b>.
          Изменено: <b>{reattribResult.updated}</b>.
          Без изменений: <b>{reattribResult.unchanged}</b>.
          Обновите дашборд — увидите новое распределение по менеджерам.
        </div>
      )}
    </>
  );
}
