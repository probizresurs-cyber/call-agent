"use client";

/**
 * Cookie-баннер для публичных страниц Call-Agent (152-ФЗ / уведомление об аналитике).
 *
 * Показывается внизу экрана, ПОКА не проставлена cookie `ca_cookie_consent=1`.
 * Кнопка «Принять» ставит эту cookie (path=/, ~1 год) и скрывает баннер.
 * Проверка наличия согласия — на клиенте через document.cookie.
 *
 * Подключается на публичных страницах (как минимум /about). sticky внизу,
 * контент критично не перекрывает.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

const BRAND = "#7c70e0";
const COOKIE_NAME = "ca_cookie_consent";

function hasConsent(): boolean {
  if (typeof document === "undefined") return true;
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${COOKIE_NAME}=1`));
}

export default function CookieBanner() {
  // По умолчанию скрыт, чтобы не мигать до проверки на клиенте.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasConsent()) setVisible(true);
  }, []);

  function accept() {
    // Ставим согласие на ~1 год.
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${COOKIE_NAME}=1; path=/; max-age=${maxAge}; SameSite=Lax`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Уведомление об использовании cookie"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 200,
        maxWidth: 920,
        margin: "0 auto",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "0 8px 32px rgba(20,23,31,0.18)",
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          flexShrink: 0,
          background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Cookie size={20} color={BRAND} />
      </div>

      <p
        style={{
          flex: "1 1 280px",
          margin: 0,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        Сайт использует файлы cookie и сервис Яндекс.Метрика. Продолжая работу с сайтом, вы
        соглашаетесь на обработку этих данных и использование сервиса Яндекс.Метрика в соответствии
        с{" "}
        <Link href="/cookie-policy" style={{ color: BRAND, textDecoration: "underline", fontWeight: 600 }}>
          Политикой обработки файлов cookie
        </Link>
        .
      </p>

      <button
        type="button"
        onClick={accept}
        style={{
          flexShrink: 0,
          background: BRAND,
          color: "#fff",
          border: "none",
          borderRadius: 9,
          padding: "10px 22px",
          font: "inherit",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        Согласен
      </button>
    </div>
  );
}
