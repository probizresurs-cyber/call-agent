"use client";

/**
 * Карточка импорта email + Open Lines чатов из Bitrix.
 * Кнопка «Импортировать сейчас» — инкрементальный fetch (только новое с прошлого раза).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageSquare, Loader2 } from "lucide-react";

interface FetchResult {
  totalFetched: number;
  inserted: number;
  skipped: number;
  errors: number;
}

export function BitrixActivitiesCard({ initialLastFetched }: { initialLastFetched: string | null }) {
  const router = useRouter();
  const [lastFetched, setLastFetched] = useState(initialLastFetched);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(fullHistory: boolean) {
    setBusy(true); setResult(null); setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (fullHistory) body.since = undefined;  // без since = с самого начала
      const r = await fetch("/call-agent/api/bitrix-activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "unknown");
      setResult(data.result as FetchResult);
      setLastFetched(new Date().toISOString());
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
        Bitrix хранит письма (TYPE_ID=4) и чаты в Open Lines (WhatsApp, Telegram, VK)
        как «активности». Этот импорт тянет их, разбирает через AI и подмешивает в профиль клиента 360.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy}
          className="ds-btn ds-btn-primary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {busy ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Mail size={14} />}
          {busy ? "Импортирую..." : "Импортировать новое"}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy}
          className="ds-btn ds-btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          title="Полный фетч с самого начала. Может занять несколько минут."
        >
          <MessageSquare size={14} />
          Импортировать всю историю
        </button>
      </div>

      {lastFetched && (
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
          Последний импорт: {new Date(lastFetched).toLocaleString("ru-RU")}
        </div>
      )}

      {result && (
        <div style={{
          padding: 10, background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.30)", borderRadius: 6, fontSize: 13,
        }}>
          <b>Готово.</b> Обработано: {result.totalFetched}.
          Добавлено: {result.inserted} (пропущено как дубль: {result.skipped}, ошибок: {result.errors}).
          Запустится обработка через AI — результаты появятся в /calls и /clients через 1-2 минуты.
        </div>
      )}

      {err && (
        <div style={{
          padding: 10, background: "rgba(220,38,38,0.08)",
          border: "1px solid rgba(220,38,38,0.30)", borderRadius: 6, fontSize: 13,
          color: "var(--destructive)",
        }}>
          Ошибка: {err}
        </div>
      )}
    </div>
  );
}
