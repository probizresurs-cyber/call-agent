"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";

export function ReminderRow({ r }: { r: { id: number; call_id: number | null; title: string; due_at: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function action(act: "done" | "snooze", hours?: number) {
    setBusy(true);
    try {
      const res = await fetch(`/call-agent/api/reminders/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: act, hours }),
      });
      if (res.ok) router.refresh();
    } finally { setBusy(false); }
  }

  const dueText = formatDue(r.due_at);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: 8, background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
          {r.call_id && (
            <Link href={`/calls/${r.call_id}`} style={{ color: "var(--primary)", marginRight: 6 }}>#{r.call_id}</Link>
          )}
          {r.title}
        </div>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
          <Clock size={10} style={{ verticalAlign: -1, marginRight: 2 }} /> {dueText}
        </div>
      </div>
      <button
        onClick={() => action("done")}
        disabled={busy}
        className="ds-button"
        title="Готово"
        style={{ fontSize: 11, padding: "4px 8px", background: "var(--success)", color: "white" }}
      >
        <CheckCircle2 size={12} style={{ verticalAlign: -1, marginRight: 3 }} />
        Готово
      </button>
      <button
        onClick={() => action("snooze", 24)}
        disabled={busy}
        className="ds-button"
        title="Отложить на 24 часа"
        style={{ fontSize: 11, padding: "4px 8px", background: "transparent", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
      >
        +1д
      </button>
    </div>
  );
}

function formatDue(due: string): string {
  const iso = due.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return due;
  const now = Date.now();
  const diff = d.getTime() - now;
  const absDays = Math.floor(Math.abs(diff) / 86400000);
  if (diff < 0) {
    if (absDays === 0) return "Просрочено сегодня";
    return `Просрочено ${absDays} ${absDays === 1 ? "день" : absDays < 5 ? "дня" : "дней"} назад`;
  }
  if (diff < 3600000) return "Скоро (меньше часа)";
  if (diff < 86400000) return `Сегодня в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  if (absDays < 7) return `Через ${absDays} дн.`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}
