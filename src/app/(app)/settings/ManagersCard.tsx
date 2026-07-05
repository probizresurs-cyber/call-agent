"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Check, X } from "lucide-react";

interface Manager {
  id: string;
  name: string;
  email: string | null;
  is_active: number;
  excluded_from_reports: number;
  default_product: string | null;
  crm_sync_enabled: number;
  calls: number;
}

interface ScriptRow {
  product: string | null;
  is_active: number | boolean;
}

export function ManagersCard() {
  const [items, setItems] = useState<Manager[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      // Список менеджеров + список продуктов из активных скриптов (для выпадашки).
      const [mr, sr] = await Promise.all([
        fetch("/call-agent/api/managers"),
        fetch("/call-agent/api/scripts"),
      ]);
      const mdata = await mr.json();
      if (mdata.ok) setItems(mdata.items);

      const sdata = await sr.json();
      if (sdata.ok) {
        const codes = [
          ...new Set(
            (sdata.items as ScriptRow[])
              .filter((s) => (s.is_active === 1 || s.is_active === true) && !!s.product)
              .map((s) => (s.product as string).trim())
              .filter(Boolean)
          ),
        ].sort();
        setProducts(codes);
      }
    } finally {
      setLoading(false);
    }
  }

  // Универсальный PATCH одного менеджера + оптимистичный апдейт переданных полей.
  async function patchManager(id: string, patch: Partial<Manager>) {
    setItems((prev) => prev.map((m) => m.id === id ? { ...m, ...patch } : m));
    try {
      const body: Record<string, unknown> = { id };
      if ("is_active" in patch) body.is_active = !!patch.is_active;
      if ("excluded_from_reports" in patch) body.excluded_from_reports = !!patch.excluded_from_reports;
      if ("default_product" in patch) body.default_product = patch.default_product ?? null;
      if ("crm_sync_enabled" in patch) body.crm_sync_enabled = !!patch.crm_sync_enabled;
      await fetch("/call-agent/api/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      startTransition(() => router.refresh());
    } catch {
      void refresh();
    }
  }

  function setProduct(id: string, product: string) {
    void patchManager(id, { default_product: product || null });
  }

  function toggleCrmSync(id: string, enabled: boolean) {
    void patchManager(id, { crm_sync_enabled: enabled ? 1 : 0 });
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
        «Закреплённый продукт» — приоритетная подсказка AI при определении типа звонка
        (AI всё равно может выбрать другой продукт по содержанию).
        «Переносить анализ в CRM» — записывать комментарий анализа в сделку Bitrix
        (по умолчанию выключено).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((m) => (
          <div key={m.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, flexWrap: "wrap",
            padding: "10px 12px",
            background: !m.excluded_from_reports ? "var(--card)" : "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            opacity: !m.excluded_from_reports ? 1 : 0.65,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 180 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {m.name || `ID ${m.id}`}
                </div>
                <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                  {m.email || `ID ${m.id}`} · звонков: {m.calls}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Закреплённый продукт (приоритетная подсказка AI) */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted-foreground)" }}>
                Продукт:
                <select
                  value={m.default_product ?? ""}
                  onChange={(e) => setProduct(m.id, e.target.value)}
                  className="ds-input"
                  style={{ minWidth: 140, fontSize: 13, padding: "4px 8px" }}
                  disabled={products.length === 0}
                  title={products.length === 0 ? "Сначала задайте продукты в скриптах" : "Закреплённый продукт менеджера"}
                >
                  <option value="">— Не закреплён —</option>
                  {products.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              {/* Переключатель переноса анализа в CRM Bitrix */}
              <button
                type="button"
                onClick={() => toggleCrmSync(m.id, !m.crm_sync_enabled)}
                className={`ds-btn ${m.crm_sync_enabled ? "ds-btn-secondary" : "ds-btn-ghost"}`}
                style={{ minWidth: 150, justifyContent: "center" }}
                title="Записывать комментарий анализа в timeline сделки Bitrix"
              >
                {m.crm_sync_enabled
                  ? <><Check size={14} /> CRM: переносим</>
                  : <><X size={14} /> CRM: не переносим</>
                }
              </button>

              {/* Видимость */}
              <button
                type="button"
                onClick={() => patchManager(m.id, { excluded_from_reports: m.excluded_from_reports ? 0 : 1 })}
                className={`ds-btn ${!m.excluded_from_reports ? "ds-btn-secondary" : "ds-btn-ghost"}`}
                style={{ minWidth: 130, justifyContent: "center" }}
                title="Скрыть из всех отчётов (напр. директор). Устойчиво к синку из Bitrix."
              >
                {!m.excluded_from_reports
                  ? <><Eye size={14} /> В отчётах</>
                  : <><EyeOff size={14} /> Скрыт</>
                }
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
