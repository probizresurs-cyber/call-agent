"use client";

/**
 * Фильтр периода для библиотеки возражений. Навигация через ?from&to.
 * Пресеты 7/30 дней + произвольный диапазон.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";

function iso(d: Date) { return d.toISOString().slice(0, 10); }

export function ObjectionsFilter() {
  const router = useRouter();
  const sp = useSearchParams();
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  function go(f: string, t: string) {
    const q = new URLSearchParams();
    if (f) q.set("from", f);
    if (t) q.set("to", t);
    router.push(`/objections${q.toString() ? `?${q}` : ""}`);
  }
  function preset(days: number) {
    const t = new Date();
    const f = new Date(); f.setDate(f.getDate() - days);
    go(iso(f), iso(t));
  }

  const active = (f: boolean) => f ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-secondary";
  const isAll = !from && !to;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
      <Calendar size={15} color="var(--muted-foreground)" />
      <button className={active(!isAll && daysAgo(from) === 7)} onClick={() => preset(7)} style={{ height: 34 }}>7 дней</button>
      <button className={active(!isAll && daysAgo(from) === 30)} onClick={() => preset(30)} style={{ height: 34 }}>30 дней</button>
      <button className={active(isAll)} onClick={() => go("", "")} style={{ height: 34 }}>За всё время</button>
      <span style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
      <input type="date" className="ds-input" value={from} max={to || undefined} onChange={(e) => go(e.target.value, to)} style={{ height: 34, padding: "0 8px" }} />
      <span style={{ color: "var(--muted-foreground)" }}>—</span>
      <input type="date" className="ds-input" value={to} min={from || undefined} onChange={(e) => go(from, e.target.value)} style={{ height: 34, padding: "0 8px" }} />
    </div>
  );
}

function daysAgo(iso: string): number {
  if (!iso) return -1;
  const d = new Date(iso + "T00:00:00Z").getTime();
  return Math.round((Date.now() - d) / 86400000);
}
