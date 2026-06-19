"use client";

/**
 * Тумблер блюра клиентских ПД в демо-режиме (для чистой записи ролика).
 *
 * По умолчанию блюр ВКЛючён (cookie ca_pii_blur отсутствует или "1").
 * Кнопка ставит cookie ca_pii_blur ('0' — выкл / '1' — вкл) на ~1 год и
 * перезагружает страницу (класс-контейнер .pii-blur ставится в layout по cookie).
 *
 * Рендерится ТОЛЬКО в демо-баннере (isDemo). На боевых аккаунтах не появляется.
 */
import { Eye, EyeOff } from "lucide-react";

export function PiiBlurToggle({ blurOn }: { blurOn: boolean }) {
  function toggle() {
    const next = blurOn ? "0" : "1";
    // path=/ — чтобы cookie действовала на все маршруты; срок ~1 год.
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `ca_pii_blur=${next}; path=/; max-age=${maxAge}; samesite=lax`;
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={blurOn ? "Показать персональные данные" : "Скрыть персональные данные"}
      style={{
        marginLeft: "auto",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.2,
        color: "var(--foreground)",
        background: "transparent",
        border: "1px solid rgba(124,112,224,0.45)",
        borderRadius: 6,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {blurOn ? <Eye size={14} strokeWidth={2} /> : <EyeOff size={14} strokeWidth={2} />}
      {blurOn ? "Показать ПД" : "Скрыть ПД"}
    </button>
  );
}
