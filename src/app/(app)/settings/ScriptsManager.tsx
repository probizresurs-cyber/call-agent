"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";

interface ChecklistItem {
  id: string;
  title: string;
  weight: number;
  description: string;
}

interface Script {
  id: number;
  name: string;
  product: string | null;
  direction: "in" | "out" | "all";
  content_md: string;
  checklist_json: string | null;
  is_active: number;
  updated_at: string;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "greeting", title: "Приветствие и представление", weight: 2, description: "Менеджер представился, назвал компанию" },
  { id: "needs", title: "Выявление потребности", weight: 5, description: "Задал открытые вопросы, понял задачу клиента" },
  { id: "pitch", title: "Презентация выгод", weight: 4, description: "Рассказал именно про выгоды, а не функции" },
  { id: "objections", title: "Отработка возражений", weight: 4, description: "Не игнорировал «дорого/подумаю», работал по технике" },
  { id: "next_step", title: "Договорённость о следующем шаге", weight: 5, description: "Конкретный шаг с датой/временем" },
];

export function ScriptsManager() {
  const [items, setItems] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Script | "new" | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/call-agent/api/scripts");
      const data = await r.json();
      if (data.ok) setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(s: Script) {
    await fetch(`/call-agent/api/scripts/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    void refresh();
    startTransition(() => router.refresh());
  }

  async function remove(s: Script) {
    if (!confirm(`Удалить скрипт «${s.name}»? Анализы старых звонков останутся.`)) return;
    await fetch(`/call-agent/api/scripts/${s.id}`, { method: "DELETE" });
    void refresh();
    startTransition(() => router.refresh());
  }

  if (editing) {
    return (
      <ScriptEditor
        initial={editing === "new" ? null : editing}
        onSave={() => { setEditing(null); void refresh(); startTransition(() => router.refresh()); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (loading) return <div className="ds-body-sm">Загрузка…</div>;

  return (
    <>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12 }}>
        Можно создать несколько скриптов с разной привязкой к продукту и направлению звонка.
        AI определяет о каком продукте разговор и автоматически применяет нужный чек-лист.
      </p>

      {items.length === 0 ? (
        <div className="ds-body-sm" style={{ padding: 16, textAlign: "center", color: "var(--muted-foreground)" }}>
          Скриптов ещё нет — создайте первый.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {items.map((s) => {
            const checklistCount = (() => {
              try {
                const arr = JSON.parse(s.checklist_json || "[]");
                return Array.isArray(arr) ? arr.length : 0;
              } catch { return 0; }
            })();
            return (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px",
                background: s.is_active ? "var(--card)" : "var(--muted)",
                opacity: s.is_active ? 1 : 0.6,
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    {s.name}
                    {s.product && (
                      <span className="ds-badge ds-badge-info">{s.product}</span>
                    )}
                    {s.direction === "in" && <ArrowDownLeft size={14} color="var(--success)" />}
                    {s.direction === "out" && <ArrowUpRight size={14} color="var(--primary)" />}
                    {!s.is_active && <span className="ds-badge">отключён</span>}
                  </div>
                  <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginTop: 2 }}>
                    {checklistCount} пунктов чек-листа · направление: {
                      s.direction === "in" ? "входящие" : s.direction === "out" ? "исходящие" : "любое"
                    }
                  </div>
                </div>
                <button type="button" className="ds-btn ds-btn-ghost"
                  onClick={() => toggleActive(s)} title={s.is_active ? "Отключить" : "Включить"}
                  style={{ width: 100, justifyContent: "center" }}>
                  {s.is_active ? "Отключить" : "Включить"}
                </button>
                <button type="button" className="ds-btn ds-btn-secondary"
                  onClick={() => setEditing(s)} title="Редактировать"
                  style={{ width: 36, padding: 0 }}>
                  <Pencil size={14} />
                </button>
                <button type="button" className="ds-btn ds-btn-ghost"
                  onClick={() => remove(s)} title="Удалить"
                  style={{ width: 36, padding: 0, color: "var(--destructive)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="ds-btn ds-btn-primary"
        onClick={() => setEditing("new")}>
        <Plus size={14} /> Добавить скрипт
      </button>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Редактор одного скрипта

function ScriptEditor({ initial, onSave, onCancel }: {
  initial: Script | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [product, setProduct] = useState(initial?.product || "");
  const [direction, setDirection] = useState<"in" | "out" | "all">(initial?.direction || "all");
  const [content, setContent] = useState(initial?.content_md || "");
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => {
    if (initial?.checklist_json) {
      try { return JSON.parse(initial.checklist_json); } catch {}
    }
    return DEFAULT_CHECKLIST;
  });
  const [busy, setBusy] = useState(false);

  function updateItem(i: number, patch: Partial<ChecklistItem>) {
    setChecklist((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setChecklist((prev) => [...prev, { id: `item_${Date.now()}`, title: "", weight: 3, description: "" }]);
  }
  function removeItem(i: number) {
    setChecklist((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!name.trim()) { alert("Укажите название"); return; }
    setBusy(true);
    try {
      const cleaned = checklist.map((c) => ({ ...c, title: c.title.trim() })).filter((c) => c.title);
      const body = {
        name: name.trim(),
        product: product.trim() || null,
        direction,
        content_md: content,
        checklist: cleaned,
        is_active: true,
      };
      if (initial) {
        await fetch(`/call-agent/api/scripts/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/call-agent/api/scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSave();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 160px", gap: 10, marginBottom: 12 }}>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Название</label>
          <input className="ds-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Например: Входящие МК"
            autoFocus
          />
        </div>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Продукт</label>
          <input className="ds-input" value={product} onChange={(e) => setProduct(e.target.value)}
            placeholder="МП, МК или пусто" />
        </div>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>Направление</label>
          <select className="ds-input" value={direction}
            onChange={(e) => setDirection(e.target.value as "in" | "out" | "all")}>
            <option value="all">Любое</option>
            <option value="in">Входящие</option>
            <option value="out">Исходящие</option>
          </select>
        </div>
      </div>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 14, fontSize: 12 }}>
        <b>Продукт</b> — короткий код (МП, МК и т.п.). Если оставить пусто — скрипт работает как
        общий для звонков где AI не смог определить продукт.
        <b style={{ marginLeft: 6 }}>Направление</b> — для каких звонков применять.
      </p>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="ds-caption">Чек-лист QC</div>
          <button type="button" className="ds-btn ds-btn-ghost" onClick={addItem}>
            <Plus size={12} /> Добавить пункт
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checklist.map((item, i) => (
            <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--card)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 32px", gap: 8 }}>
                <input className="ds-input" placeholder="Название пункта"
                  value={item.title} onChange={(e) => updateItem(i, { title: e.target.value })} />
                <select className="ds-input" value={item.weight}
                  onChange={(e) => updateItem(i, { weight: Number(e.target.value) })} title="Вес 1-5">
                  {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>×{w}</option>)}
                </select>
                <button type="button" className="ds-btn ds-btn-ghost"
                  onClick={() => removeItem(i)}
                  style={{ color: "var(--destructive)" }}>×</button>
              </div>
              <input className="ds-input"
                placeholder="Описание для AI: что считается выполнением"
                value={item.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>

      <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>
        Дополнительные инструкции (Markdown, опционально)
      </label>
      <textarea className="ds-textarea" rows={6}
        value={content} onChange={(e) => setContent(e.target.value)}
        placeholder="Скопируйте текст вашего скрипта здесь — AI учтёт это при оценке. Можно сюда же добавить специфику продукта, стоп-фразы, ToV."
      />

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="ds-btn ds-btn-primary" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={14} className="mr-spin" /> : <Save size={14} />}
          Сохранить
        </button>
        <button type="button" className="ds-btn ds-btn-secondary" onClick={onCancel} disabled={busy}>
          <X size={14} /> Отмена
        </button>
      </div>
    </>
  );
}
