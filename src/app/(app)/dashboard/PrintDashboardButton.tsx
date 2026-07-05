"use client";

/**
 * Кнопка «PDF» в шапке дашборда — серверный экспорт отчёта.
 *
 * Дёргает /api/reports/dashboard-pdf (headless-рендер на сервере → готовый A4-PDF
 * с полями), скачивает файл. Не зависит от диалога печати браузера. Период и
 * фильтры берутся из текущего URL (?from=&to=&manager_id=&with_crm=).
 */
import { useState } from "react";
import { Printer } from "lucide-react";

export function PrintDashboardButton() {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const qs = typeof window !== "undefined" ? window.location.search : "";
      const res = await fetch(`/call-agent/api/reports/dashboard-pdf${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Не удалось сформировать PDF. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="ds-btn ds-btn-secondary no-print"
      onClick={download}
      disabled={busy}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
      title="Скачать отчёт в PDF (A4, с полями)"
    >
      {busy ? <span className="spinner" /> : <Printer size={16} />}
      {busy ? "Готовим PDF…" : "PDF"}
    </button>
  );
}
