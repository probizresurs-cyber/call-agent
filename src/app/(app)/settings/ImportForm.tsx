"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "7 дней", days: 7 },
  { label: "14 дней", days: 14 },
  { label: "30 дней", days: 30 },
  { label: "90 дней", days: 90 },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Result =
  | { ok: true; totalFetched: number; inserted: number; skipped: number; pages: number; durationMs: number; note: string | null }
  | { ok: false; error: string; partial?: { totalFetched: number; inserted: number; skipped: number; pages: number } };

export function ImportForm() {
  const [fromDate, setFromDate] = useState<string>(isoDaysAgo(7));
  const [toDate, setToDate] = useState<string>(today());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function applyPreset(days: number) {
    setFromDate(isoDaysAgo(days));
    setToDate(today());
  }

  async function go() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/call-agent/api/import/bitrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate }),
      });
      const data = (await res.json()) as Result;
      setResult(data);
      if (data.ok) startTransition(() => router.refresh());
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            className="ds-btn ds-btn-secondary"
            onClick={() => applyPreset(p.days)}
            style={{ height: 30, padding: "0 12px", fontSize: 13 }}
          >
            Последние {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>С даты</label>
          <input
            type="date"
            className="ds-input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            max={toDate}
          />
        </div>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>По дату</label>
          <input
            type="date"
            className="ds-input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={fromDate}
            max={today()}
          />
        </div>
        <button
          type="button"
          className="ds-btn ds-btn-primary"
          onClick={go}
          disabled={busy || !fromDate}
        >
          {busy && <Loader2 size={14} className="mr-spin" />}
          Импортировать
        </button>
      </div>

      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 8 }}>
        Звонки добавляются в очередь со статусом <code>pending</code>.
        Воркер начинает обрабатывать сразу. Лимит — до 1000 звонков за один запуск.
      </p>

      {result && (
        <div
          className="ds-card"
          style={{
            marginTop: 14,
            background: result.ok ? "rgba(31,157,85,0.08)" : "rgba(212,67,67,0.08)",
            borderColor: result.ok ? "rgba(31,157,85,0.30)" : "rgba(212,67,67,0.30)",
          }}
        >
          {result.ok ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Импорт завершён</div>
              <Row label="Всего получено из Битрикса" value={String(result.totalFetched)} />
              <Row label="Добавлено новых" value={String(result.inserted)} />
              <Row label="Пропущено (дубли / без записи)" value={String(result.skipped)} />
              <Row label="Страниц обработано" value={String(result.pages)} />
              <Row label="Время" value={`${(result.durationMs / 1000).toFixed(1)} сек`} />
              {result.note && (
                <div style={{ marginTop: 8, fontSize: 13, color: "var(--warning)" }}>
                  {result.note}
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 13 }}>
                Импортированные звонки появятся на странице{" "}
                <a href="/call-agent/calls" style={{ color: "var(--primary)" }}>Звонки</a>
                {" "}по мере обработки воркером.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, color: "var(--destructive)", marginBottom: 8 }}>
                Ошибка импорта
              </div>
              <div style={{ fontSize: 13 }}>{result.error}</div>
              {result.partial && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted-foreground)" }}>
                  До ошибки успели: получено {result.partial.totalFetched}, добавлено{" "}
                  {result.partial.inserted}, пропущено {result.partial.skipped}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}
