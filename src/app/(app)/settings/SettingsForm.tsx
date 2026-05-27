"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Script = { id: number; name: string; content_md: string; updated_at: string };

export function SettingsForm({ initial }: { initial: Script | null }) {
  const [name, setName] = useState(initial?.name || "Скрипт по умолчанию");
  const [content, setContent] = useState(initial?.content_md || "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function save() {
    const res = await fetch("/call-agent/api/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content }),
    });
    const data = await res.json();
    if (data.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      startTransition(() => router.refresh());
    } else {
      alert("Ошибка: " + data.error);
    }
  }

  return (
    <>
      <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Название</label>
      <input className="ds-input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 12 }} />

      <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Содержание (Markdown)</label>
      <textarea
        className="ds-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={12}
        placeholder="1. Приветствие&#10;2. Выявление потребностей&#10;3. Презентация продукта&#10;4. Работа с возражениями&#10;5. Договорённость о следующем шаге"
      />

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="ds-btn ds-btn-primary" onClick={save} disabled={pending}>
          {pending ? <span className="spinner" /> : null} Сохранить и активировать
        </button>
        {saved && <span className="ds-badge ds-badge-success">Сохранено</span>}
      </div>

      {initial && (
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 10 }}>
          Последнее обновление: {initial.updated_at}
        </div>
      )}
    </>
  );
}
