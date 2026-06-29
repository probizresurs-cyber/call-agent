/**
 * Общий каркас для публичных юридических документов Call-Agent
 * (Политика ПД, Оферта, Согласия, Cookie-политика).
 *
 * Server component. Стиль платформы: CSS-переменные темы + бренд #7c70e0,
 * читаемый документ в контейнере maxWidth ~760. Сверху — баннер-предупреждение
 * для заказчика (черновик / реквизиты [ЗАПОЛНИТЬ]) и ссылка «← На главную».
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, PhoneCall } from "lucide-react";

const BRAND = "#7c70e0";

export default function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
        padding: "0 20px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Шапка */}
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "22px 0", flexWrap: "wrap", gap: 12,
          }}
        >
          <Link
            href="/about"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              color: "var(--muted-foreground)", textDecoration: "none", fontSize: 14, fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} /> На главную
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: 8, background: BRAND,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <PhoneCall size={16} color="#fff" strokeWidth={2.4} />
            </div>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Call-Agent</span>
          </div>
        </header>

        {/* Баннер-предупреждение для заказчика */}
        <div
          style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.35)",
            borderRadius: 12, padding: "14px 16px", margin: "8px 0 28px",
          }}
        >
          <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--foreground)" }}>
            <b>Черновик.</b> Финальный текст согласовать с юристом, заполнить реквизиты, отмеченные{" "}
            <b>[ЗАПОЛНИТЬ]</b>. Этот документ — типовой шаблон и не является юридической консультацией.
          </p>
        </div>

        {/* Заголовок документа */}
        <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 800, margin: "0 0 8px", lineHeight: 1.2 }}>
          {title}
        </h1>
        {updated && (
          <p style={{ fontSize: 13.5, color: "var(--muted-foreground)", margin: "0 0 32px" }}>
            Редакция от {updated}
          </p>
        )}

        {/* Тело документа */}
        <article style={{ fontSize: 15.5, lineHeight: 1.7, color: "var(--foreground)" }}>
          {children}
        </article>

        {/* Низ */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
          <Link
            href="/about"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              color: BRAND, textDecoration: "none", fontSize: 14, fontWeight: 600,
            }}
          >
            <ArrowLeft size={16} /> На главную
          </Link>
        </div>
      </div>
    </main>
  );
}

/* ── Вспомогательные блоки для тела документа ── */

export function Section({ n, title, children }: { n?: string; title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 12px", lineHeight: 1.3 }}>
        {n ? `${n}. ` : ""}{title}
      </h2>
      <div style={{ color: "var(--muted-foreground)" }}>{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 12px" }}>{children}</p>;
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** Плейсхолдер реквизита, который заказчик должен заполнить. */
export function Fill({ children }: { children: ReactNode }) {
  return (
    <mark
      style={{
        background: "rgba(217,119,6,0.18)",
        color: "var(--foreground)",
        padding: "1px 6px",
        borderRadius: 4,
        fontWeight: 600,
      }}
    >
      [{children}]
    </mark>
  );
}
