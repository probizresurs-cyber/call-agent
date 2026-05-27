"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ChecklistItem {
  id: string;
  title: string;
  weight: number;
  description: string;
}

type ScriptInit = {
  id: number;
  name: string;
  content_md: string;
  checklist_json: string | null;
  updated_at: string;
} | null;

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "greeting", title: "Приветствие и представление", weight: 2, description: "Менеджер представился, назвал компанию" },
  { id: "needs", title: "Выявление потребности", weight: 5, description: "Задал открытые вопросы, понял задачу клиента" },
  { id: "pitch", title: "Презентация выгод", weight: 4, description: "Рассказал именно про выгоды, а не функции" },
  { id: "objections", title: "Отработка возражений", weight: 4, description: "Не игнорировал «дорого/подумаю», работал по технике" },
  { id: "next_step", title: "Договорённость о следующем шаге", weight: 5, description: "Конкретный шаг с датой/временем" },
];

export function SettingsForm({ initial }: { initial: ScriptInit }) {
  const [name, setName] = useState(initial?.name || "Чек-лист по умолчанию");
  const [content, setContent] = useState(initial?.content_md || "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    if (initial?.checklist_json) {
      try { return JSON.parse(initial.checklist_json); } catch {}
    }
    return DEFAULT_CHECKLIST;
  });
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateItem(i: number, patch: Partial<ChecklistItem>) {
    setChecklist((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setChecklist((prev) => [
      ...prev,
      { id: `item_${Date.now()}`, title: "", weight: 3, description: "" },
    ]);
  }
  function removeItem(i: number) {
    setChecklist((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    const cleaned = checklist
      .map((c) => ({ ...c, title: c.title.trim() }))
      .filter((c) => c.title);
    const res = await fetch("/call-agent/api/script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content, checklist: cleaned }),
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
      <input className="ds-input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 16 }} />

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="ds-caption">Чек-лист QC</div>
          <button type="button" className="ds-btn ds-btn-ghost" onClick={addItem}>+ Добавить пункт</button>
        </div>

        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 10 }}>
          Каждый пункт оценивается отдельно. <b>Вес</b> 1-5 — насколько важен пункт для итоговой оценки.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {checklist.map((item, i) => (
            <div key={item.id} style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 12,
              background: "var(--card)",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 32px", gap: 8 }}>
                <input
                  className="ds-input"
                  placeholder="Название пункта"
                  value={item.title}
                  onChange={(e) => updateItem(i, { title: e.target.value })}
                />
                <select
                  className="ds-input"
                  value={item.weight}
                  onChange={(e) => updateItem(i, { weight: Number(e.target.value) })}
                  title="Вес 1-5"
                >
                  {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>×{w}</option>)}
                </select>
                <button
                  type="button"
                  className="ds-btn ds-btn-ghost"
                  onClick={() => removeItem(i)}
                  title="Удалить"
                  style={{ color: "var(--destructive)" }}
                >×</button>
              </div>
              <input
                className="ds-input"
                placeholder="Описание для AI: что именно считается выполнением"
                value={item.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                style={{ marginTop: 8 }}
              />
            </div>
          ))}
        </div>
      </div>

      <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>
        Дополнительные инструкции (опционально, Markdown)
      </label>
      <textarea
        className="ds-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        placeholder="Дополнения к чек-листу — например, специфика продукта, стоп-фразы, ToV."
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
