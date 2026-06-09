"use client";

/**
 * Список заявок с публичной формы онбординга.
 * Карточки: компания, контакт, дата, статус-бейдж + раскрываемые детали
 * (полный payload по секциям). Использует ds-классы и CSS-переменные темы.
 */
import { useState } from "react";
import {
  ClipboardList, ChevronDown, ChevronRight, Building2, Plug,
  Headphones, Users, FileText, Settings, BarChart3, MessageSquare,
  Mail, Phone, Calendar,
} from "lucide-react";

export interface OnboardingItem {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  bitrix_url: string;
  telephony_type: string | null;
  status: string;
  created_at: string;
  payload: Record<string, unknown>;
}

// Статус → подпись + цвет
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "Новая", color: "#7c70e0", bg: "rgba(124,112,224,0.14)" },
  in_progress: { label: "В работе", color: "#0ea5e9", bg: "rgba(14,165,233,0.14)" },
  done: { label: "Подключено", color: "#22c55e", bg: "rgba(34,197,94,0.14)" },
  rejected: { label: "Отклонена", color: "#f87171", bg: "rgba(248,113,113,0.14)" },
};

function fmtDate(s: string): string {
  // created_at приходит строкой ("2026-06-09 12:34:56" или ISO) — рендерим как есть, человеко-читаемо
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function val(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  return String(v);
}

// Описание секций для раскрытого вида: иконка, заголовок, поля [ключ, подпись]
const SECTIONS: { icon: typeof Building2; title: string; fields: [string, string][] }[] = [
  {
    icon: Building2, title: "Компания",
    fields: [
      ["niche", "Ниша"],
      ["timezone", "Часовой пояс"],
    ],
  },
  {
    icon: Plug, title: "Bitrix24",
    fields: [
      ["webhook_ready", "Вебхук создан"],
      ["webhook_url", "URL вебхука"],
      ["bitrix_notes", "Примечания"],
    ],
  },
  {
    icon: Headphones, title: "Телефония",
    fields: [
      ["telephony_type", "Тип"],
      ["telephony_other", "Другая АТС"],
    ],
  },
  {
    icon: Users, title: "Команда",
    fields: [
      ["managers_text", "Менеджеры"],
      ["head_name", "РОП / руководитель"],
      ["reports_recipient", "Получатель отчётов"],
    ],
  },
  {
    icon: FileText, title: "Скрипт и чек-лист",
    fields: [
      ["has_script", "Есть скрипт"],
      ["products", "Продукты"],
      ["script_notes", "Доп. о скрипте"],
    ],
  },
  {
    icon: Settings, title: "Настройки анализа",
    fields: [
      ["ai_model", "Модель AI"],
      ["contact_threshold", "Порог контакта, сек"],
      ["import_service", "Импорт служебных"],
      ["backfill_days", "Импорт истории"],
    ],
  },
  {
    icon: BarChart3, title: "Отчёты",
    fields: [
      ["report_frequency", "Частота"],
      ["telegram", "Telegram"],
    ],
  },
  {
    icon: MessageSquare, title: "CRM-запись и прочее",
    fields: [
      ["crm_write", "Запись в карточку"],
      ["glossary", "Глоссарий"],
      ["comments", "Комментарии"],
    ],
  },
];

function RequestCard({ item }: { item: OnboardingItem }) {
  const [open, setOpen] = useState(false);
  const st = STATUS_META[item.status] ?? { label: item.status, color: "var(--muted-foreground)", bg: "var(--muted)" };
  const p = item.payload;

  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Шапка карточки — кликабельна для раскрытия */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", textAlign: "left", cursor: "pointer",
          background: "transparent", border: "none", padding: 16,
          display: "flex", alignItems: "flex-start", gap: 12, color: "inherit",
          fontFamily: "inherit",
        }}
      >
        <div style={{ marginTop: 2, color: "var(--muted-foreground)", flexShrink: 0 }}>
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>
              {item.company_name}
            </span>
            <span
              style={{
                fontSize: 11.5, fontWeight: 600, padding: "2px 9px", borderRadius: 20,
                color: st.color, background: st.bg,
              }}
            >
              {st.label}
            </span>
          </div>
          <div
            style={{
              display: "flex", flexWrap: "wrap", gap: "4px 18px",
              fontSize: 13, color: "var(--muted-foreground)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Users size={13} /> {item.contact_name}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Mail size={13} /> {item.contact_email}
            </span>
            {item.contact_phone && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Phone size={13} /> {item.contact_phone}
              </span>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Calendar size={13} /> {fmtDate(item.created_at)}
            </span>
          </div>
        </div>
      </button>

      {/* Раскрытые детали */}
      {open && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {/* Bitrix URL — отдельно, т.к. это колонка а не payload-секция */}
          <DetailSection
            icon={Plug}
            title="Bitrix24 — портал"
            rows={[["URL портала", item.bitrix_url]]}
          />
          {SECTIONS.map((sec) => (
            <DetailSection
              key={sec.title}
              icon={sec.icon}
              title={sec.title}
              rows={sec.fields.map(([k, label]) => [label, val(p, k)])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailSection({
  icon: Icon, title, rows,
}: {
  icon: typeof Building2;
  title: string;
  rows: [string, string][];
}) {
  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 7,
          fontSize: 12.5, fontWeight: 700, color: "var(--foreground)",
          marginBottom: 8, textTransform: "none",
        }}
      >
        <Icon size={14} color="var(--muted-foreground)" />
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ fontSize: 13 }}>
            <span style={{ color: "var(--muted-foreground)" }}>{label}: </span>
            <span style={{ color: "var(--foreground)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OnboardingRequestsClient({ items }: { items: OnboardingItem[] }) {
  return (
    <>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="ds-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ClipboardList size={24} strokeWidth={2} />
          Заявки на подключение
        </h1>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 6 }}>
          Заявки с публичной формы онбординга. Всего: {items.length}.
        </p>
      </div>

      {items.length === 0 ? (
        <div
          className="ds-card"
          style={{
            textAlign: "center", padding: "40px 24px",
            color: "var(--muted-foreground)",
          }}
        >
          <ClipboardList size={32} strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.6 }} />
          <p style={{ margin: "0 0 6px", fontWeight: 600, color: "var(--foreground)" }}>
            Заявок пока нет
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            Публичная форма: <code>/call-agent/onboarding</code>
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item) => (
            <RequestCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
