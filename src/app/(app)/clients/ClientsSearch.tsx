"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function ClientsSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [pending, startTransition] = useTransition();

  function apply() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    startTransition(() => router.push("/clients" + (params.toString() ? `?${params}` : "")));
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 400 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--muted-foreground)" }} />
        <input
          className="ds-input"
          placeholder="Поиск по телефону, имени, менеджеру…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
          style={{ width: "100%", paddingLeft: 32 }}
        />
      </div>
      <button onClick={apply} disabled={pending} className="ds-btn ds-btn-primary">
        Найти
      </button>
      {initial && (
        <button onClick={() => { setQ(""); startTransition(() => router.push("/clients")); }} className="ds-btn ds-btn-ghost">
          Сбросить
        </button>
      )}
    </div>
  );
}
