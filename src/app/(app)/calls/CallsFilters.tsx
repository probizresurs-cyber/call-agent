"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return isoDate(new Date());
}
function yesterdayIso(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return isoDate(d);
}

export function CallsFilters() {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  const fromParam = search.get("from") || "";
  const toParam = search.get("to") || "";
  const qParam = search.get("q") || "";
  const sentimentParam = search.get("sentiment") || "";
  const statusParam = search.get("status") || "";
  const typeParam = search.get("type") || "";

  const [from, setFrom] = useState(fromParam);
  const [to, setTo] = useState(toParam);
  const [q, setQ] = useState(qParam);
  const [sentiment, setSentiment] = useState(sentimentParam);
  const [status, setStatus] = useState(statusParam);
  const [type, setType] = useState(typeParam);

  function navigate(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    startTransition(() => router.push("/calls" + (params.toString() ? `?${params}` : "")));
  }

  function apply() {
    navigate({ from, to, q, sentiment, status, type });
  }
  function reset() {
    setFrom(""); setTo(""); setQ(""); setSentiment(""); setStatus(""); setType("");
    startTransition(() => router.push("/calls"));
  }
  function presetToday() {
    const t = todayIso();
    setFrom(t); setTo(t);
    navigate({ from: t, to: t, q, sentiment, status });
  }
  function presetYesterday() {
    const y = yesterdayIso();
    setFrom(y); setTo(y);
    navigate({ from: y, to: y, q, sentiment, status });
  }
  function presetLast7() {
    const d = new Date(); d.setDate(d.getDate() - 6);
    const f = isoDate(d), t = todayIso();
    setFrom(f); setTo(t);
    navigate({ from: f, to: t, q, sentiment, status });
  }
  function shiftDay(delta: number) {
    // Если from/to не задан — отталкиваемся от сегодня
    const base = from || todayIso();
    const d = new Date(base);
    d.setDate(d.getDate() + delta);
    const ds = isoDate(d);
    setFrom(ds); setTo(ds);
    navigate({ from: ds, to: ds, q, sentiment, status });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
      {/* Верхняя строка: дата-навигация */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => shiftDay(-1)} title="Назад день"
          style={{ width: 36, padding: 0 }}>
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          className="ds-input"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={apply}
          max={to || todayIso()}
          style={{ width: 160 }}
        />
        <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>—</span>
        <input
          type="date"
          className="ds-input"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={apply}
          min={from || undefined}
          max={todayIso()}
          style={{ width: 160 }}
        />
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => shiftDay(+1)} title="Вперёд день"
          style={{ width: 36, padding: 0 }}>
          <ChevronRight size={16} />
        </button>

        <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />

        <button type="button" className="ds-btn ds-btn-secondary" onClick={presetYesterday}>Вчера</button>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={presetToday}>
          <Calendar size={14} style={{ marginRight: 4 }} /> Сегодня
        </button>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={presetLast7}>7 дней</button>
        <button type="button" className="ds-btn ds-btn-ghost" onClick={reset} style={{ marginLeft: "auto" }}>
          Сбросить
        </button>
      </div>

      {/* Нижняя строка: поиск и фильтры */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="ds-input"
          placeholder="Поиск по транскрипту…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
          style={{ flex: "1 1 280px", minWidth: 200 }}
        />
        <select className="ds-input" value={type} onChange={(e) => { setType(e.target.value); navigate({ from, to, q, sentiment, status, type: e.target.value }); }} style={{ width: 150 }}>
          <option value="">Все типы</option>
          <option value="call">Звонки</option>
          <option value="chat">Чаты</option>
          <option value="email">Email</option>
          <option value="meeting">Встречи</option>
        </select>
        <select className="ds-input" value={sentiment} onChange={(e) => { setSentiment(e.target.value); navigate({ from, to, q, sentiment: e.target.value, status, type }); }} style={{ width: 170 }}>
          <option value="">Все настроения</option>
          <option value="positive">Позитив</option>
          <option value="neutral">Нейтрально</option>
          <option value="negative">Негатив</option>
        </select>
        <select className="ds-input" value={status} onChange={(e) => { setStatus(e.target.value); navigate({ from, to, q, sentiment, status: e.target.value, type }); }} style={{ width: 170 }}>
          <option value="">Все статусы</option>
          <option value="done">Готово</option>
          <option value="pending">В очереди</option>
          <option value="no_recording">Без записи</option>
          <option value="failed">Ошибка</option>
        </select>
        <button type="button" className="ds-btn ds-btn-primary" onClick={apply} disabled={pending}>
          Применить
        </button>
      </div>
    </div>
  );
}
