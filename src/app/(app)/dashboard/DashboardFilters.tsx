"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { DateRangePicker } from "@/app/_components/DateRangePicker";

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

interface ManagerOption {
  id: string;
  name: string;
}

export function DashboardFilters({ managers }: { managers?: ManagerOption[] }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  const fromParam = search.get("from") || "";
  const toParam = search.get("to") || "";
  const withCrm = search.get("with_crm") === "true";
  const managerParam = search.get("manager_id") || "";
  const [from, setFrom] = useState(fromParam);
  const [to, setTo] = useState(toParam);
  const [managerId, setManagerId] = useState(managerParam);

  function navigate(next: { from: string; to: string; withCrm?: boolean; managerId?: string }) {
    setFrom(next.from); setTo(next.to);
    if (next.managerId !== undefined) setManagerId(next.managerId);
    const params = new URLSearchParams();
    if (next.from) params.set("from", next.from);
    if (next.to)   params.set("to",   next.to);
    const crm = next.withCrm !== undefined ? next.withCrm : withCrm;
    if (crm) params.set("with_crm", "true");
    const mgr = next.managerId !== undefined ? next.managerId : managerId;
    if (mgr) params.set("manager_id", mgr);
    startTransition(() => router.push("/dashboard" + (params.toString() ? `?${params}` : "")));
  }

  function toggleCrm() {
    navigate({ from, to, withCrm: !withCrm });
  }

  function applyPreset(p: Preset) {
    navigate({ ...p.range() });
  }

  function reset() {
    setFrom(""); setTo(""); setManagerId("");
    startTransition(() => router.push("/dashboard"));
  }

  function shiftDay(delta: number) {
    const base = from || isoDate(today());
    const d = new Date(base); d.setDate(d.getDate() + delta);
    const s = isoDate(d);
    navigate({ from: s, to: s });
  }

  function onManagerChange(id: string) {
    navigate({ from, to, managerId: id });
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
    <>
      {/* Верхняя мини-строка: тогл "Только с CRM" — отдельно справа */}
      <div style={{
        display: "flex", justifyContent: "flex-end",
        marginBottom: 8,
      }}>
        <button
          type="button"
          onClick={toggleCrm}
          disabled={pending}
          title={withCrm
            ? "Сейчас показываются только звонки привязанные к Сделке / Лиду / Контакту в CRM"
            : "Показываются все звонки, включая холодные без CRM-привязки"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "0 12px", height: 28, fontSize: 12,
            borderRadius: 14,
            border: `1px solid ${withCrm ? "var(--primary)" : "var(--border)"}`,
            background: withCrm ? "color-mix(in oklch, var(--primary) 15%, var(--card))" : "var(--card)",
            color: withCrm ? "var(--primary)" : "var(--muted-foreground)",
            cursor: pending ? "wait" : "pointer",
            fontWeight: withCrm ? 600 : 400,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: withCrm ? "var(--primary)" : "var(--muted-foreground)",
            display: "inline-block",
          }} />
          Только с CRM
        </button>
      </div>

    <div style={{
      display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
      marginBottom: 20, padding: 10, background: "var(--card)",
      border: "1px solid var(--border)", borderRadius: 8,
    }}>
      {/* Пресеты диапазона */}
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => applyPreset(p)}
          className={active === p.key ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-secondary"}
          style={{ height: 30, padding: "0 10px", fontSize: 13, flexShrink: 0, whiteSpace: "nowrap" }}
          disabled={pending}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={reset}
        className={active === "all" ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-ghost"}
        style={{ height: 30, padding: "0 10px", fontSize: 13, flexShrink: 0, whiteSpace: "nowrap" }}
        disabled={pending}
      >
        За всё время
      </button>

      {/* Разделитель */}
      <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px", flexShrink: 0 }} />

      {/* Фильтр менеджеров */}
      {managers && managers.length > 0 && (
        <select
          value={managerId}
          onChange={(e) => onManagerChange(e.target.value)}
          disabled={pending}
          title="Фильтр по менеджеру"
          style={{
            height: 30, padding: "0 8px", fontSize: 13, flexShrink: 0,
            background: managerId ? "color-mix(in oklch, var(--primary) 10%, var(--card))" : "var(--card)",
            border: `1px solid ${managerId ? "var(--primary)" : "var(--border)"}`,
            color: managerId ? "var(--primary)" : "var(--foreground)",
            borderRadius: 4, minWidth: 150,
          }}
        >
          <option value="">Все менеджеры</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</option>
          ))}
        </select>
      )}

      {/* Стрелки и date picker */}
      <button type="button" className="ds-btn ds-btn-secondary"
        onClick={() => shiftDay(-1)} title="На день назад"
        style={{ width: 30, height: 30, padding: 0, flexShrink: 0 }}>
        <ChevronLeft size={14} />
      </button>
      <DateRangePicker
        from={from}
        to={to}
        onChange={(f, t) => navigate({ from: f, to: t })}
        maxDate={isoDate(today())}
      />
      <button type="button" className="ds-btn ds-btn-secondary"
        onClick={() => shiftDay(+1)} title="На день вперёд"
        style={{ width: 30, height: 30, padding: 0, flexShrink: 0 }}>
        <ChevronRight size={14} />
      </button>
    </div>
    </>
  );
}
