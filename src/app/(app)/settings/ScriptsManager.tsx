"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, ArrowDownLeft, ArrowUpRight, Loader2, Upload, FileText, ListChecks } from "lucide-react";

interface ChecklistItem {
  id: string;
  title: string;
  weight: number;
  description: string;
  block?: string;
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="ds-btn ds-btn-primary"
          onClick={() => setEditing("new")}>
          <Plus size={14} /> Добавить скрипт
        </button>
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={async () => {
            if (!confirm("Создать готовый шаблон Металлопрокат (МП)? Внутри полный текст скрипта обработки входящей заявки с записью на КЭВ + 20 пунктов чек-листа в 7 блоках. Можно потом редактировать.")) return;
            const r = await fetch("/call-agent/api/scripts/template?key=mp", { method: "POST" });
            const data = await r.json();
            if (data.ok) {
              void refresh();
              startTransition(() => router.refresh());
            } else {
              alert("Ошибка: " + data.error);
            }
          }}>
            <FileText size={14} /> Шаблон МП (металлопрокат)
        </button>
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={async () => {
            if (!confirm("Создать готовый шаблон Металлоконструкции (МК)? Внутри полный текст скрипта обработки входящей заявки на строительство под ключ + 20 пунктов чек-листа.")) return;
            const r = await fetch("/call-agent/api/scripts/template?key=mk", { method: "POST" });
            const data = await r.json();
            if (data.ok) {
              void refresh();
              startTransition(() => router.refresh());
            } else {
              alert("Ошибка: " + data.error);
            }
          }}>
          <FileText size={14} /> Шаблон МК (металлоконструкции)
        </button>
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={async () => {
            if (!confirm("Создать шаблон «Холодный звонок / выявление потребности»? 11 пунктов чек-листа специально для холодных и квалификационных звонков — без оценки закрытия, фокус на выявлении и следующем шаге.")) return;
            const r = await fetch("/call-agent/api/scripts/template?key=cold", { method: "POST" });
            const data = await r.json();
            if (data.ok) { void refresh(); startTransition(() => router.refresh()); }
            else alert("Ошибка: " + data.error);
          }}>
          <FileText size={14} /> Шаблон «Холодный звонок»
        </button>
        <button type="button" className="ds-btn ds-btn-secondary"
          onClick={async () => {
            if (!confirm("Создать шаблон «Звонок по сделке»? 9 пунктов чек-листа: открытие с учётом истории сделки, работа с возражениями, попытка закрытия, договорённость о следующем шаге.")) return;
            const r = await fetch("/call-agent/api/scripts/template?key=deal", { method: "POST" });
            const data = await r.json();
            if (data.ok) { void refresh(); startTransition(() => router.refresh()); }
            else alert("Ошибка: " + data.error);
          }}>
          <FileText size={14} /> Шаблон «По сделке»
        </button>
      </div>
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
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadDocx(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/call-agent/api/scripts/upload-docx", {
        method: "POST",
        body: fd,
      });
      const data = await r.json();
      if (data.ok) {
        // вставляем в конец content (а не заменяем)
        const prefix = content.trim() ? content + "\n\n" : "";
        setContent(prefix + `=== Из файла ${data.fileName} ===\n${data.text}`);
        if (!name.trim()) {
          // если имя пусто — подставляем из имени файла
          setName(file.name.replace(/\.docx$/i, ""));
        }
      } else {
        alert("Ошибка загрузки: " + data.error);
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function updateItem(i: number, patch: Partial<ChecklistItem>) {
    setChecklist((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem(block?: string) {
    setChecklist((prev) => [...prev, {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      title: "", weight: 1, description: "", block: block || ""
    }]);
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

      {/* ────── СЕКЦИЯ 1: ТЕКСТ СКРИПТА ────── */}
      <div style={{
        marginBottom: 18, padding: 14,
        border: "1px solid var(--border)", borderRadius: 8,
        background: "color-mix(in oklch, var(--primary) 4%, var(--card))",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={16} strokeWidth={2} color="var(--primary)" />
            <b style={{ fontSize: 14 }}>Скрипт продаж</b>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              ref={fileInput}
              type="file"
              accept=".docx"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadDocx(f);
              }}
            />
            <button type="button" className="ds-btn ds-btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}>
              {uploading ? <Loader2 size={14} className="mr-spin" /> : <Upload size={14} />}
              Загрузить .docx
            </button>
          </div>
        </div>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 10 }}>
          Полный текст скрипта разговора. AI использует его как контекст при оценке —
          понимает специфику продукта, стоп-фразы, ожидаемые формулировки.
          Можно загрузить .docx файл (Word), его содержимое вставится сюда.
        </p>
        <textarea className="ds-textarea" rows={10}
          value={content} onChange={(e) => setContent(e.target.value)}
          placeholder="Скопируйте или загрузите текст скрипта продаж..."
        />
      </div>

      {/* ────── СЕКЦИЯ 2: ЧЕК-ЛИСТ QC ────── */}
      <div style={{
        marginBottom: 14, padding: 14,
        border: "1px solid var(--border)", borderRadius: 8,
        background: "color-mix(in oklch, var(--success) 4%, var(--card))",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ListChecks size={16} strokeWidth={2} color="var(--success)" />
            <b style={{ fontSize: 14 }}>Чек-лист контроля качества</b>
          </div>
          <button type="button" className="ds-btn ds-btn-ghost" onClick={() => addItem()}>
            <Plus size={12} /> Добавить пункт
          </button>
        </div>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 10 }}>
          Сгруппируйте пункты по блокам (Установление контакта, Презентация, Закрытие и т.п.).
          AI оценит каждый пункт от 0 до 1, итог = взвешенное среднее. Вес ×1-×5 — важность.
        </p>

        {/* Группируем по блокам, сохраняя порядок появления */}
        {(() => {
          const blocks: { name: string; indexes: number[] }[] = [];
          checklist.forEach((it, i) => {
            const b = (it.block || "").trim() || "Без блока";
            let blk = blocks.find((x) => x.name === b);
            if (!blk) { blk = { name: b, indexes: [] }; blocks.push(blk); }
            blk.indexes.push(i);
          });

          return blocks.map((blk) => (
            <div key={blk.name} style={{ marginBottom: 14 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", marginBottom: 6,
                background: "var(--accent)", borderRadius: 4,
                fontWeight: 600, fontSize: 13,
              }}>
                <span>{blk.name}</span>
                <button type="button" className="ds-btn ds-btn-ghost"
                  onClick={() => addItem(blk.name === "Без блока" ? "" : blk.name)}
                  style={{ height: 24, padding: "0 8px", fontSize: 12 }}>
                  <Plus size={11} /> в блок
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {blk.indexes.map((i) => {
                  const item = checklist[i];
                  return (
                    <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--card)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 80px 32px", gap: 8 }}>
                        <input className="ds-input" placeholder="Название критерия"
                          value={item.title} onChange={(e) => updateItem(i, { title: e.target.value })} />
                        <input className="ds-input" placeholder="Блок (категория)"
                          value={item.block || ""} onChange={(e) => updateItem(i, { block: e.target.value })} />
                        <select className="ds-input" value={item.weight}
                          onChange={(e) => updateItem(i, { weight: Number(e.target.value) })} title="Вес 1-5">
                          {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>×{w}</option>)}
                        </select>
                        <button type="button" className="ds-btn ds-btn-ghost"
                          onClick={() => removeItem(i)}
                          style={{ color: "var(--destructive)" }}>×</button>
                      </div>
                      <textarea className="ds-textarea" rows={2}
                        placeholder="Расшифровка для AI: что именно считается выполнением пункта"
                        value={item.description}
                        onChange={(e) => updateItem(i, { description: e.target.value })}
                        style={{ marginTop: 8, fontSize: 13 }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
      </div>

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
