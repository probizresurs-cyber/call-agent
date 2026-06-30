"use client";

/**
 * Форма заявки на лендинге Call-Agent с 152-ФЗ обвязкой.
 *
 * Приём включён (FORM_ENABLED=true): сабмит → POST /call-agent/api/contact,
 * заявка сохраняется в БД (таблица contact_requests), смотрим на
 * /contact-requests. FORM_ENABLED=false скрывает приём (форма видна, но не шлёт).
 *
 * Два чекбокса (по официальной инструкции заказчика по ПД), оба НЕ отмечены
 * по умолчанию (согласие пользователь ставит сам — иначе оно невалидно):
 *   1) согласие на обработку ПД — ОБЯЗАТЕЛЬНЫЙ (ссылки: /consent + /privacy);
 *   2) согласие на рассылку      — НЕОБЯЗАТЕЛЬНЫЙ (ссылка: /consent-marketing).
 * Кнопка активна, когда указаны имя + телефон/email И отмечено согласие на ПДн.
 * Согласие на рассылку на активацию НЕ влияет (нельзя принуждать).
 */

import { useState } from "react";
import Link from "next/link";
import { Send, CheckCircle2 } from "lucide-react";

const BRAND = "#7c70e0";

// ── Главный рубильник формы ──
// true  = приём заявок включён: сабмит → POST /call-agent/api/contact (БД).
// false = форма видна, но не отправляет (приём временно отключён).
const FORM_ENABLED = true;

export default function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // Согласия. Обязательное: на обработку ПДн. Необязательное: рассылка.
  const [agreePd, setAgreePd] = useState(false); // обязательный
  const [agreeMarketing, setAgreeMarketing] = useState(false); // необязательный
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Для осмысленной заявки нужны имя и хотя бы один способ связи.
  const hasContact = name.trim().length > 0 && (phone.trim().length > 0 || email.trim().length > 0);
  // Кнопка активна, если форма включена, заполнены контакты и отмечено согласие
  // на ПДн (рекламная рассылка — необязательна, на активацию НЕ влияет).
  const canSubmit = FORM_ENABLED && agreePd && hasContact && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // basePath /call-agent к fetch НЕ добавляется автоматически — пишем явно.
      const res = await fetch("/call-agent/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          message,
          consent_pd: true, // обязательное согласие (иначе кнопка неактивна)
          marketing_consent: agreeMarketing,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        setSent(true);
      } else {
        setError(data?.error || "Не удалось отправить заявку. Попробуйте позже.");
      }
    } catch {
      setError("Нет связи с сервером. Проверьте интернет и попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Экран успеха (заглушка после сабмита при FORM_ENABLED=true) ──
  if (sent) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "40px 28px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            margin: "0 auto 16px",
            background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircle2 size={28} color={BRAND} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
          Спасибо, заявка принята
        </h3>
        <p style={{ fontSize: 15, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.55 }}>
          Мы свяжемся с вами в ближайшее время.
        </p>
      </div>
    );
  }

  // ── Форма отключена: показываем уведомление вместо полей (ПД не собираем) ──
  if (!FORM_ENABLED) {
    return (
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "40px 28px",
          textAlign: "center",
        }}
      >
        <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
          Приём заявок скоро откроется
        </h3>
        <p style={{ fontSize: 15, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.55 }}>
          Мы дорабатываем форму под требования закона о персональных данных (152-ФЗ).
          Совсем скоро здесь снова можно будет оставить заявку.
        </p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 9,
    border: "1px solid var(--input)",
    background: "var(--input-bg)",
    color: "var(--foreground)",
    font: "inherit",
    fontSize: 15,
    outline: "none",
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "28px 24px",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }} className="form-grid">
        <div>
          <label style={labelStyle}>Имя</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как к вам обращаться"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Телефон</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 ___ ___-__-__"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.ru"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>
          Сообщение <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>(необязательно)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Сколько менеджеров, какая CRM, что хотите контролировать…"
          rows={3}
          style={{ ...inputStyle, resize: "vertical", minHeight: 84, lineHeight: 1.5 }}
        />
      </div>

      {/* ── Три согласия (152-ФЗ), все НЕ отмечены по умолчанию ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
        {/* 1. Согласие на обработку ПД — ОБЯЗАТЕЛЬНЫЙ */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={agreePd}
            onChange={(e) => setAgreePd(e.target.checked)}
            style={checkboxStyle}
          />
          <span>
            Даю{" "}
            <Link href="/consent" style={linkStyle} target="_blank">
              согласие
            </Link>{" "}
            на обработку персональных данных в соответствии с{" "}
            <Link href="/privacy" style={linkStyle} target="_blank">
              Политикой обработки персональных данных
            </Link>
          </span>
        </label>

        {/* 2. Согласие на рекламную рассылку — НЕОБЯЗАТЕЛЬНЫЙ */}
        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            checked={agreeMarketing}
            onChange={(e) => setAgreeMarketing(e.target.checked)}
            style={checkboxStyle}
          />
          <span>
            Даю{" "}
            <Link href="/consent-marketing" style={linkStyle} target="_blank">
              согласие
            </Link>{" "}
            на получение информационной и рекламной рассылки{" "}
            <span style={{ color: "var(--muted-foreground)", opacity: 0.85 }}>(необязательно)</span>
          </span>
        </label>
      </div>

      {/* ── Кнопка отправки ── */}
      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          width: "100%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "13px 24px",
          borderRadius: 11,
          border: "none",
          background: canSubmit ? BRAND : "color-mix(in oklch, var(--muted-foreground) 22%, transparent)",
          color: "#fff",
          font: "inherit",
          fontWeight: 700,
          fontSize: 16,
          cursor: canSubmit ? "pointer" : "not-allowed",
          opacity: canSubmit ? 1 : 0.7,
          transition: "background 150ms, opacity 150ms",
        }}
      >
        <Send size={17} /> {submitting ? "Отправляем…" : "Отправить заявку"}
      </button>

      {/* Ошибка отправки */}
      {error && (
        <p style={{ fontSize: 13, color: "var(--destructive, #e5484d)", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5, fontWeight: 500 }}>
          {error}
        </p>
      )}

      {/* Подпись под кнопкой (требование 152-ФЗ) */}
      <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>
        Нажимая кнопку, вы соглашаетесь на обработку персональных данных.
      </p>

      {/* Пометка о недоступности приёма заявок (когда FORM_ENABLED=false) */}
      {!FORM_ENABLED && (
        <p
          style={{
            fontSize: 13,
            color: "var(--warning)",
            textAlign: "center",
            margin: "12px 0 0",
            lineHeight: 1.5,
            fontWeight: 500,
          }}
        >
          Приём заявок временно недоступен — свяжитесь с нами по контактам ниже.
        </p>
      )}
    </form>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
  color: "var(--foreground)",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 13.5,
  lineHeight: 1.5,
  color: "var(--muted-foreground)",
  cursor: "pointer",
};

const checkboxStyle: React.CSSProperties = {
  width: 17,
  height: 17,
  marginTop: 1,
  flexShrink: 0,
  accentColor: BRAND,
  cursor: "pointer",
};

const linkStyle: React.CSSProperties = {
  color: BRAND,
  textDecoration: "underline",
  fontWeight: 600,
};
