"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function today(): Date {
  return new Date();
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  // Понедельник = 1; getDay() возвращает 0=вс, 1=пн, ..., 6=сб
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
  range: () => { from: string; to: string };
}

const PRESETS: Preset[] = [
  {
    key: "today",
    label: "Сегодня",
    range: () => {
      const t = isoDate(today());
      return { from: t, to: t };
    },
  },
  {
    key: "yesterday",
    label: "Вчера",
    range: () => {
      const d = today(); d.setDate(d.getDate() - 1);
      const s = isoDate(d);
      return { from: s, to: s };
    },
  },
  {
    key: "this_week",
    label: "Эта неделя",
    range: () => {
      const from = isoDate(startOfWeek(today()));
      return { from, to: isoDate(today()) };
    },
  },
  {
    key: "last_week",
    label: "Прошлая неделя",
    range: () => {
      const start = startOfWeek(today());
      const lastEnd = new Date(start); lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfWeek(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    },
  },
  {
    key: "this_month",
    label: "Этот месяц",
    range: () => {
      return { from: isoDate(startOfMonth(today())), to: isoDate(today()) };
    },
  },
  {
    key: "last_month",
    label: "Прошлый месяц",
    range: () => {
      const s = startOfMonth(today());
      const lastEnd = new Date(s); lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfMonth(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    },
  },
];

export function DashboardFilters() {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  const fromParam = search.get("from") || "";
  const toParam = search.get("to") || "";
  const [from, setFrom] = useState(fromParam);
  const [to, setTo] = useState(toParam);

  function navigate(next: { from: string; to: string }) {
    setFrom(next.from); setTo(next.to);
    const params = new URLSearchParams();
    if (next.from) params.set("from", next.from);
    if (next.to)   params.set("to",   next.to);
    startTransition(() => router.push("/dashboard" + (params.toString() ? `?${params}` : "")));
  }

  function applyPreset(p: Preset) {
    navigate(p.range());
  }

  function reset() {
    setFrom(""); setTo("");
    startTransition(() => router.push("/dashboard"));
  }

  function shiftDay(delta: number) {
    const base = from || isoDate(today());
    const d = new Date(base); d.setDate(d.getDate() + delta);
    const s = isoDate(d);
    navigate({ from: s, to: s });
  }

  // Определяем какой пресет сейчас активен (для подсветки)
  function activePreset(): string | null {
    if (!from && !to) return "all";
    for (const p of PRESETS) {
      const r = p.range();
      if (r.from === from && r.to === to) return p.key;
    }
    return null;
  }
  const active = activePreset();

  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
      marginBottom: 20, padding: 12, background: "var(--card)",
      border: "1px solid var(--border)", borderRadius: 8,
    }}>
      {/* Левая часть: пресеты */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "1 1 auto" }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p)}
            className={active === p.key ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-secondary"}
            style={{ height: 30, padding: "0 12px", fontSize: 13 }}
            disabled={pending}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={reset}
          className={active === "all" ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-ghost"}
          style={{ height: 30, padding: "0 12px", fontSize: 13 }}
          disabled={pending}
        >
          За всё время
        </button>
      </div>

      {/* Правая часть: ручные даты и стрелки */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={() => shiftDay(-1)} title="На день назад"
          style={{ width: 30, height: 30, padding: 0 }}>
          <ChevronLeft size={14} />
        </button>
        <input
          type="date"
          className="ds-input"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onBlur={() => from && navigate({ from, to: to || from })}
          max={to || isoDate(today())}
          style={{ width: 140, height: 30 }}
        />
        <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>—</span>
        <input
          type="date"
          className="ds-input"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => to && navigate({ from: from || to, to })}
          min={from || undefined}
          max={isoDate(today())}
          style={{ width: 140, height: 30 }}
        />
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={() => shiftDay(+1)} title="На день вперёд"
          style={{ width: 30, height: 30, padding: 0 }}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
