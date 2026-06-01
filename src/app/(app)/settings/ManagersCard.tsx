"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

interface Manager {
  id: string;
  name: string;
  email: string | null;
  is_active: number;
  calls: number;
}

export function ManagersCard() {
  const [items, setItems] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/call-agent/api/managers");
      const data = await r.json();
      if (data.ok) setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  async function toggle(id: string, is_active: boolean) {
    // Оптимистичный апдейт
    setItems((prev) => prev.map((m) => m.id === id ? { ...m, is_active: is_active ? 1 : 0 } : m));
    try {
      await fetch("/call-agent/api/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active }),
      });
      startTransition(() => router.refresh());
    } catch {
      void refresh();
    }
  }

  if (loading) {
    return <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>Загрузка…</div>;
  }
  if (items.length === 0) {
    return <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>Менеджеры появятся после первого импорта.</div>;
  }

  return (
    <>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
        Отключённые менеджеры не отображаются в дашборде и не учитываются в статистике.
        Их звонки остаются в БД — это просто фильтр отображения.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((m) => (
          <div key={m.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px",
            background: m.is_active ? "var(--card)" : "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            opacity: m.is_active ? 1 : 0.65,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.name || `ID ${m.id}`}
                </div>
                <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                  {m.email || `ID ${m.id}`} · звонков: {m.calls}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggle(m.id, !m.is_active)}
              className={`ds-btn ${m.is_active ? "ds-btn-secondary" : "ds-btn-ghost"}`}
              style={{ minWidth: 130, justifyContent: "center" }}
            >
              {m.is_active
                ? <><Eye size={14} /> Показывается</>
                : <><EyeOff size={14} /> Скрыт</>
              }
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
