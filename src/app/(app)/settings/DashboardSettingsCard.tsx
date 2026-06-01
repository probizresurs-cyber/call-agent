"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";

const DEFAULT_THRESHOLD = 15;

export function DashboardSettingsCard() {
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    fetch("/call-agent/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          const v = parseInt(data.settings.contact_threshold_seconds || "", 10);
          if (Number.isFinite(v) && v > 0) setThreshold(v);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/call-agent/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "contact_threshold_seconds", value: String(threshold) }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>Загрузка…</div>;
  }

  const missedThreshold = Math.max(5, Math.floor(threshold / 1.5));

  return (
    <>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 14 }}>
        Параметры подсчёта в колонках таблицы менеджеров на дашборде.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, alignItems: "end" }}>
        <div>
          <label className="ds-caption" style={{ display: "block", marginBottom: 4 }}>
            Порог «Разговор состоялся», сек
          </label>
          <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 6 }}>
            Звонки длительностью ≥ этого значения считаются состоявшимися контактами.
            «Не дозвон» = звонки короче <b>{missedThreshold} сек</b> (треть порога).
          </p>
        </div>
        <input
          type="number"
          className="ds-input"
          min="5"
          max="300"
          value={threshold}
          onChange={(e) => setThreshold(Math.max(5, parseInt(e.target.value, 10) || DEFAULT_THRESHOLD))}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <button type="button" className="ds-btn ds-btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="mr-spin" /> : <Save size={14} />}
          Сохранить
        </button>
        {saved && <span className="ds-badge ds-badge-success">Сохранено</span>}
      </div>
    </>
  );
}
