"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { DateRangePicker } from "@/app/_components/DateRangePicker";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function today(): Date {
  return new Date();
}
function todayIso(): string {
  return isoDate(new Date());
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

export function CallsFilters({ managers }: { managers?: ManagerOption[] }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  const fromParam = search.get("from") || "";
  const toParam = search.get("to") || "";
  const qParam = search.get("q") || "";
  const sentimentParam = search.get("sentiment") || "";
  const statusParam = search.get("status") || "";
  const typeParam = search.get("type") || "";
  const managerParam = search.get("manager_id") || "";
  const minDurationParam = search.get("min_duration") || "";
  const allParam = search.get("period") === "all";  // явный выбор «За всё время»

  const [from, setFrom] = useState(fromParam);
  const [to, setTo] = useState(toParam);
  const [q, setQ] = useState(qParam);
  const [sentiment, setSentiment] = useState(sentimentParam);
  const [status, setStatus] = useState(statusParam);
  const [type, setType] = useState(typeParam);
  const [managerId, setManagerId] = useState(managerParam);
  const [minDuration, setMinDuration] = useState(minDurationParam);

  // Дефолт «Сегодня»: при первом заходе без параметров периода (нет from/to и нет
  // period=all) — подставляем сегодняшний день. Чтобы открыть «За всё время» —
  // нужен явный ?period=all.
  useEffect(() => {
    if (!fromParam && !toParam && !allParam) {
      const t = isoDate(today());
      const params = new URLSearchParams();
      params.set("from", t);
      params.set("to", t);
      if (qParam) params.set("q", qParam);
      if (sentimentParam) params.set("sentiment", sentimentParam);
      if (statusParam) params.set("status", statusParam);
      if (typeParam) params.set("type", typeParam);
      if (managerParam) params.set("manager_id", managerParam);
      if (minDurationParam) params.set("min_duration", minDurationParam);
      router.replace("/calls" + `?${params}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Синхронизируем локальный state from/to с URL (в т.ч. после дефолт-редиректа
  // на «Сегодня») — иначе подсветка активного пресета не сработает.
  useEffect(() => {
    setFrom(fromParam);
    setTo(toParam);
  }, [fromParam, toParam]);

  function navigate(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    startTransition(() => router.push("/calls" + (params.toString() ? `?${params}` : "")));
  }

  function apply() {
    navigate({ from, to, q, sentiment, status, type, manager_id: managerId, min_duration: minDuration });
  }
  function reset() {
    // Сброс всех фильтров → возврат к дефолтному виду «Сегодня».
    const t = isoDate(today());
    setFrom(t); setTo(t); setQ(""); setSentiment(""); setStatus(""); setType(""); setManagerId(""); setMinDuration("");
    startTransition(() => router.push(`/calls?from=${t}&to=${t}`));
  }
  function applyPreset(p: Preset) {
    const r = p.range();
    setFrom(r.from); setTo(r.to);
    navigate({ from: r.from, to: r.to, q, sentiment, status, type, manager_id: managerId, min_duration: minDuration });
  }
  function showAll() {
    setFrom(""); setTo("");
    // Явный маркер «За всё время» (иначе сработает дефолт «Сегодня»).
    const params = new URLSearchParams();
    params.set("period", "all");
    if (q) params.set("q", q);
    if (sentiment) params.set("sentiment", sentiment);
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (managerId) params.set("manager_id", managerId);
    if (minDuration) params.set("min_duration", minDuration);
    startTransition(() => router.push("/calls" + `?${params}`));
  }
  // Определяем какой пресет сейчас активен (для подсветки)
  function activePreset(): string | null {
    if (allParam) return "all";
    if (!from && !to) return null;
    for (const p of PRESETS) {
      const r = p.range();
      if (r.from === from && r.to === to) return p.key;
    }
    return null;
  }
  function shiftDay(delta: number) {
    const base = from || todayIso();
    const d = new Date(base);
    d.setDate(d.getDate() + delta);
    const ds = isoDate(d);
    setFrom(ds); setTo(ds);
    navigate({ from: ds, to: ds, q, sentiment, status, type, manager_id: managerId, min_duration: minDuration });
  }

  const active = activePreset();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
      {/* Верхняя строка: пресеты, затем дата-навигация в конце */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={active === p.key ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-secondary"}
            onClick={() => applyPreset(p)}
            disabled={pending}
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
          >
            {p.key === "today" ? <><Calendar size={14} style={{ marginRight: 4 }} /> {p.label}</> : p.label}
          </button>
        ))}
        <button
          type="button"
          className={active === "all" ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-secondary"}
          onClick={showAll}
          disabled={pending}
          style={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          За всё время
        </button>

        <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 4px" }} />

        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => shiftDay(-1)} title="Назад день"
          style={{ width: 30, height: 30, padding: 0 }}>
          <ChevronLeft size={16} />
        </button>
        <DateRangePicker
          from={from}
          to={to}
          onChange={(f, t) => { setFrom(f); setTo(t); navigate({ from: f, to: t, q, sentiment, status, type, manager_id: managerId, min_duration: minDuration }); }}
          maxDate={todayIso()}
        />
        <button type="button" className="ds-btn ds-btn-secondary" onClick={() => shiftDay(+1)} title="Вперёд день"
          style={{ width: 30, height: 30, padding: 0 }}>
          <ChevronRight size={16} />
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
        <select className="ds-input" value={type} onChange={(e) => { setType(e.target.value); navigate({ from, to, q, sentiment, status, type: e.target.value, manager_id: managerId, min_duration: minDuration }); }} style={{ flex: "1 1 140px", minWidth: 130, maxWidth: "100%" }}>
          <option value="">Все типы</option>
          <option value="call">Звонки</option>
          <option value="chat">Чаты</option>
          <option value="email">Email</option>
          <option value="meeting">Встречи</option>
        </select>
        <select className="ds-input" value={sentiment} onChange={(e) => { setSentiment(e.target.value); navigate({ from, to, q, sentiment: e.target.value, status, type, manager_id: managerId, min_duration: minDuration }); }} style={{ flex: "1 1 160px", minWidth: 150, maxWidth: "100%" }}>
          <option value="">Все настроения</option>
          <option value="positive">Позитив</option>
          <option value="neutral">Нейтрально</option>
          <option value="negative">Негатив</option>
        </select>
        <select className="ds-input" value={status} onChange={(e) => { setStatus(e.target.value); navigate({ from, to, q, sentiment, status: e.target.value, type, manager_id: managerId, min_duration: minDuration }); }} style={{ flex: "1 1 160px", minWidth: 150, maxWidth: "100%" }}>
          <option value="">Все статусы</option>
          <option value="done">Готово</option>
          <option value="pending">В очереди</option>
          <option value="no_recording">Без записи</option>
          <option value="failed">Ошибка</option>
        </select>
        <select
          className="ds-input"
          value={minDuration}
          onChange={(e) => { setMinDuration(e.target.value); navigate({ from, to, q, sentiment, status, type, manager_id: managerId, min_duration: e.target.value }); }}
          title="Минимальная длительность"
          style={{
            flex: "1 1 150px", minWidth: 140, maxWidth: "100%",
            background: minDuration ? "color-mix(in oklch, var(--primary) 10%, var(--card))" : undefined,
            borderColor: minDuration ? "var(--primary)" : undefined,
            color: minDuration ? "var(--primary)" : undefined,
          }}
        >
          <option value="">Длительность: любая</option>
          <option value="15">от 15с</option>
          <option value="30">от 30с</option>
          <option value="60">от 1мин</option>
          <option value="90">от 1.5мин</option>
          <option value="180">от 3мин</option>
          <option value="300">от 5мин</option>
          <option value="600">от 10мин</option>
        </select>
        {managers && managers.length > 0 && (
          <select
            className="ds-input"
            value={managerId}
            onChange={(e) => { setManagerId(e.target.value); navigate({ from, to, q, sentiment, status, type, manager_id: e.target.value, min_duration: minDuration }); }}
            title="Фильтр по менеджеру"
            style={{
              flex: "1 1 170px", minWidth: 150, maxWidth: "100%",
              background: managerId ? "color-mix(in oklch, var(--primary) 10%, var(--card))" : undefined,
              borderColor: managerId ? "var(--primary)" : undefined,
              color: managerId ? "var(--primary)" : undefined,
            }}
          >
            <option value="">Все менеджеры</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</option>
            ))}
          </select>
        )}
        <button type="button" className="ds-btn ds-btn-primary" onClick={apply} disabled={pending}>
          Применить
        </button>
        <button type="button" className="ds-btn ds-btn-ghost" onClick={reset} disabled={pending}>
          Сбросить всё
        </button>
      </div>
    </div>
  );
}
