"use client";

/**
 * Кастомный date-range picker — один блок-trigger + popover с календарём.
 * Решает три проблемы нативного <input type="date">:
 *   1. Один input вместо двух разрозненных
 *   2. Клик по любому месту области открывает picker (не только по иконке)
 *   3. Кнопка «Сбросить» вместо нативного «Удалить»
 */
import { useEffect, useRef, useState } from "react";
import { Calendar, X } from "lucide-react";

interface Props {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  maxDate?: string;
}

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function parseIso(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function formatDisplay(s: string): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

export function DateRangePicker({ from, to, onChange, maxDate }: Props) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseIso(to || from) || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function selectDay(d: Date) {
    const isoStr = iso(d);
    if (!from || (from && to)) {
      onChange(isoStr, "");
    } else {
      if (isoStr < from) onChange(isoStr, from);
      else onChange(from, isoStr);
      setTimeout(() => setOpen(false), 150);
    }
  }

  function reset() {
    onChange("", "");
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  const displayText = from && to
    // Один день (from == to) — показываем одну дату, не дублируем (компактнее)
    ? (from === to ? formatDisplay(from) : `${formatDisplay(from)} — ${formatDisplay(to)}`)
    : from
    ? `${formatDisplay(from)} — выберите конец`
    : "Выбрать период";

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          height: 30, padding: "0 12px", fontSize: 13,
          background: from || to ? "color-mix(in oklch, var(--primary) 10%, var(--card))" : "var(--card)",
          border: `1px solid ${from || to ? "var(--primary)" : "var(--border)"}`,
          color: from || to ? "var(--primary)" : "var(--foreground)",
          whiteSpace: "nowrap",
          minWidth: 220,
          justifyContent: "space-between",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Calendar size={14} />
          {displayText}
        </span>
        {(from || to) && (
          <span
            onClick={(e) => { e.stopPropagation(); reset(); }}
            style={{ display: "inline-flex", alignItems: "center", opacity: 0.7, cursor: "pointer" }}
            title="Сбросить период"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          padding: 12, minWidth: 280,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button type="button" onClick={() => shiftMonth(-1)} style={navBtnStyle}>‹</button>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button type="button" onClick={() => shiftMonth(+1)} style={navBtnStyle}>›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {DAYS.map((d) => (
              <div key={d} style={{
                textAlign: "center", fontSize: 11, color: "var(--muted-foreground)",
                fontWeight: 600, padding: 2,
              }}>{d}</div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {buildMonthGrid(viewMonth).map((day, i) => {
              const isCurrentMonth = day.getMonth() === viewMonth.getMonth();
              const isoStr = iso(day);
              const inRange = from && to && isoStr >= from && isoStr <= to;
              const isStart = isoStr === from;
              const isEnd = isoStr === to;
              const isToday = isoStr === iso(new Date());
              const disabled = maxDate ? isoStr > maxDate : false;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => !disabled && selectDay(day)}
                  disabled={disabled}
                  style={{
                    width: 32, height: 32, padding: 0,
                    border: "none", borderRadius: 4,
                    background:
                      isStart || isEnd ? "var(--primary)" :
                      inRange ? "color-mix(in oklch, var(--primary) 15%, transparent)" :
                      isToday ? "color-mix(in oklch, var(--primary) 8%, transparent)" :
                      "transparent",
                    color:
                      isStart || isEnd ? "white" :
                      !isCurrentMonth ? "var(--muted-foreground)" :
                      disabled ? "var(--muted-foreground)" :
                      "var(--foreground)",
                    opacity: !isCurrentMonth ? 0.4 : disabled ? 0.3 : 1,
                    fontSize: 13,
                    fontWeight: isStart || isEnd || isToday ? 600 : 400,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)",
          }}>
            <button type="button" onClick={reset} style={footerBtnStyle}>Сбросить</button>
            <button
              type="button"
              onClick={() => {
                const t = iso(new Date());
                onChange(t, t);
                setOpen(false);
              }}
              style={{ ...footerBtnStyle, background: "var(--muted)" }}
            >
              Сегодня
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  height: 26, padding: "0 8px", fontSize: 14,
  background: "transparent", border: "none", color: "var(--foreground)", cursor: "pointer",
  borderRadius: 4,
};

const footerBtnStyle: React.CSSProperties = {
  height: 26, padding: "0 10px", fontSize: 12,
  background: "transparent", border: "1px solid var(--border)",
  borderRadius: 4, cursor: "pointer", color: "var(--foreground)",
};

function buildMonthGrid(viewMonth: Date): Date[] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const dayOfWeek = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - dayOfWeek);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}
