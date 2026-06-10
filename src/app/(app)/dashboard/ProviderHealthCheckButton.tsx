"use client";

/**
 * Кнопка «Проверить провайдера» в баннере деградации провайдера.
 * Дёргает GET /call-agent/api/provider-health/check → probe OpenAI →
 * обновляет статус в settings. Если провайдер снова ОК — перезагружает
 * страницу (баннер сам исчезнет). Иначе показывает свежий результат.
 *
 * Доступна только owner/admin (probe делает реальный запрос к провайдеру) —
 * родительский server-component рендерит её только для этих ролей.
 */
import { useState } from "react";
import { RotateCw } from "lucide-react";

export function ProviderHealthCheckButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/call-agent/api/provider-health/check");
      const data = await r.json();
      if (data?.ok && data.health?.status === "ok") {
        // Провайдер снова доступен — обновляем страницу, баннер исчезнет.
        window.location.reload();
        return;
      }
      setNote(data?.health?.message || "Провайдер всё ещё недоступен");
    } catch {
      setNote("Не удалось проверить — попробуйте позже");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={check}
        disabled={busy}
        className="ds-btn ds-btn-secondary"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
      >
        <RotateCw size={12} />
        {busy ? "Проверяю..." : "Проверить провайдера"}
      </button>
      {note && <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{note}</span>}
    </div>
  );
}
