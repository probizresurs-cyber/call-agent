/**
 * Общий каркас для публичных юридических документов Call-Agent
 * (Политика ПД, Согласия, Cookie-политика).
 *
 * Server component. Стиль платформы: CSS-переменные темы + бренд #7c70e0,
 * читаемый документ в контейнере maxWidth ~760 и ссылка «← На главную».
 */
import type { ReactNode, CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, PhoneCall } from "lucide-react";

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

        {/* Заголовок документа */}
        <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 800, margin: "28px 0 8px", lineHeight: 1.2 }}>
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

export function List({ items, ordered }: { items: ReactNode[]; ordered?: boolean }) {
  const style: CSSProperties = {
    margin: "0 0 12px", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6,
  };
  const children = items.map((it, i) => <li key={i}>{it}</li>);
  return ordered ? <ol style={style}>{children}</ol> : <ul style={style}>{children}</ul>;
}

/** Подзаголовок-подпись над заголовком (напр. «Приложение № 2 к Политике…»). */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 14, color: "var(--muted-foreground)", margin: "28px 0 4px", fontWeight: 500 }}>
      {children}
    </p>
  );
}

/** Блок реквизитов оператора в рамке (шапка согласий). */
export function OperatorBox({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--muted, rgba(124,112,224,0.06))",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 16px",
        margin: "0 0 24px",
        fontSize: 14.5,
        lineHeight: 1.6,
        color: "var(--foreground)",
      }}
    >
      {children}
    </div>
  );
}

/** Список «термин — определение» (раздел терминов и сокращений). */
export function DefList({ items }: { items: { term: ReactNode; def: ReactNode }[] }) {
  return (
    <dl style={{ margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 14 }}>
      {items.map((it, i) => (
        <div key={i}>
          <dt style={{ fontWeight: 700, color: "var(--foreground)", marginBottom: 2 }}>{it.term}</dt>
          <dd style={{ margin: 0 }}>{it.def}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Карточка цели обработки ПДн (Приложение № 1). Читаемо на телефоне:
 * каждая цель — отдельная карточка с парами «поле / значение» вместо
 * широкой таблицы со скроллом.
 */
export type AppendixRow = {
  goal: ReactNode;
  subjects: ReactNode;
  data: ReactNode[];
  methods: ReactNode;
  actions: ReactNode;
  term: ReactNode;
  disposal: ReactNode;
};

function AppendixField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
          color: "var(--muted-foreground)", marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function AppendixCards({ rows }: { rows: AppendixRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, margin: "0 0 12px" }}>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 18px",
            background: "var(--muted, rgba(124,112,224,0.04))",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span
              style={{
                flexShrink: 0, minWidth: 24, height: 24, borderRadius: 6, background: "#7c70e0",
                color: "#fff", fontSize: 13, fontWeight: 700, display: "inline-flex",
                alignItems: "center", justifyContent: "center", padding: "0 6px",
              }}
            >
              {i + 1}
            </span>
            <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--foreground)", lineHeight: 1.4 }}>
              {r.goal}
            </div>
          </div>
          <AppendixField label="Категории субъектов ПДн">{r.subjects}</AppendixField>
          <AppendixField label="Перечень ПДн">
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 3 }}>
              {r.data.map((d, j) => (
                <li key={j}>{d}</li>
              ))}
            </ul>
          </AppendixField>
          <AppendixField label="Способы обработки">{r.methods}</AppendixField>
          <AppendixField label="Перечень действий с ПДн">{r.actions}</AppendixField>
          <AppendixField label="Срок обработки и хранения">{r.term}</AppendixField>
          <AppendixField label="Порядок уничтожения">{r.disposal}</AppendixField>
        </div>
      ))}
    </div>
  );
}
