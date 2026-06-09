"use client";

/**
 * Публичная страница опросника онбординга новой компании.
 * Доступна БЕЗ авторизации по /call-agent/onboarding (вне группы (app)).
 * Стиль — как у /pricing: тёмный фон, inline-стили, контейнер по центру.
 *
 * Форма из 8 секций. Обязательные поля (*): company_name, contact_name,
 * contact_email, bitrix_url. По «Отправить заявку» POST на /call-agent/api/onboarding.
 */
import { useState } from "react";
import {
  PhoneCall, Building2, Plug, Headphones, Users, FileText,
  Settings, BarChart3, MessageSquare, CheckCircle2, Loader2, AlertCircle,
} from "lucide-react";

/* ─── Палитра (как pricing) ──────────────────────────────────── */
const C = {
  bg: "#0d0f14",
  card: "#11151d",
  cardBorder: "#1f2535",
  fg: "#e8eaf0",
  muted: "#8b93a7",
  faint: "#6b7280",
  primary: "#7c70e0",
  primaryDark: "#5b4fc7",
  inputBg: "#0f1420",
  inputBorder: "#222a3a",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── Состояние формы ────────────────────────────────────────── */
interface FormState {
  // 1. Компания
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  niche: string;
  timezone: string;
  // 2. Bitrix24
  bitrix_url: string;
  webhook_ready: boolean;
  webhook_url: string;
  bitrix_notes: string;
  // 3. Телефония
  telephony_type: string;
  telephony_other: string;
  // 4. Команда
  managers_text: string;
  head_name: string;
  reports_recipient: string;
  // 5. Скрипт и чек-лист
  has_script: boolean;
  products: string;
  script_notes: string;
  // 6. Настройки анализа
  ai_model: string;
  contact_threshold: number;
  import_service: boolean;
  backfill_days: string;
  // 7. Отчёты
  report_frequency: string;
  telegram: string;
  // 8. CRM-запись и прочее
  crm_write: boolean;
  glossary: string;
  comments: string;
}

const INITIAL: FormState = {
  company_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  niche: "",
  timezone: "МСК (UTC+3)",
  bitrix_url: "",
  webhook_ready: false,
  webhook_url: "",
  bitrix_notes: "",
  telephony_type: "Встроенная телефония Bitrix24",
  telephony_other: "",
  managers_text: "",
  head_name: "",
  reports_recipient: "",
  has_script: false,
  products: "",
  script_notes: "",
  ai_model: "Не знаю, выберите за меня",
  contact_threshold: 15,
  import_service: false,
  backfill_days: "Не импортировать историю",
  report_frequency: "Еженедельно",
  telegram: "",
  crm_write: false,
  glossary: "",
  comments: "",
};

/* ─── Переиспользуемые UI-кусочки ────────────────────────────── */

function Section({
  icon: Icon, title, children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.cardBorder}`,
        borderRadius: 14,
        padding: "22px 22px 24px",
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: 9,
            background: "rgba(124,112,224,0.13)",
            display: "grid", placeItems: "center",
            color: C.primary, flexShrink: 0,
          }}
        >
          <Icon size={17} strokeWidth={2} />
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.fg }}>{title}</h2>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.fg }}>
        {label}
        {required && <span style={{ color: "#f87171", marginLeft: 4 }}>*</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>{hint}</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: C.inputBg,
  border: `1px solid ${C.inputBorder}`,
  borderRadius: 8,
  color: C.fg,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

function Radio({
  name, value, current, onChange, label,
}: {
  name: string;
  value: string;
  current: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "9px 12px", borderRadius: 8, cursor: "pointer",
        background: active ? "rgba(124,112,224,0.12)" : C.inputBg,
        border: `1px solid ${active ? "rgba(124,112,224,0.5)" : C.inputBorder}`,
        fontSize: 13.5, color: C.fg,
      }}
    >
      <input
        type="radio"
        name={name}
        checked={active}
        onChange={() => onChange(value)}
        style={{ accentColor: C.primary }}
      />
      {label}
    </label>
  );
}

function Checkbox({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex", alignItems: "flex-start", gap: 9,
        cursor: "pointer", fontSize: 13.5, color: C.fg, lineHeight: 1.5,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: C.primary, marginTop: 2, flexShrink: 0 }}
      />
      <span>{label}</span>
    </label>
  );
}

/* ─── Страница ───────────────────────────────────────────────── */

export default function OnboardingPage() {
  const [f, setF] = useState<FormState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: val }));
  }

  function validate(): string | null {
    if (!f.company_name.trim()) return "Укажите название компании";
    if (!f.contact_name.trim()) return "Укажите контактное лицо";
    if (!f.contact_email.trim()) return "Укажите email";
    if (!EMAIL_RE.test(f.contact_email.trim())) return "Некорректный email";
    if (!f.bitrix_url.trim()) return "Укажите URL портала Bitrix24";
    return null;
  }

  async function submit() {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/call-agent/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || "Не удалось отправить заявку");
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.fg,
        fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif",
        padding: "48px 20px 80px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Шапка */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              fontWeight: 700, fontSize: 17, color: C.fg, marginBottom: 18,
            }}
          >
            <PhoneCall size={18} color={C.primary} />
            Call-Agent
          </div>
          <h1
            style={{
              fontSize: "clamp(24px,4vw,34px)", fontWeight: 800,
              letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 12px",
            }}
          >
            Подключение вашей компании
          </h1>
          <p style={{ color: C.muted, fontSize: 15, maxWidth: 520, margin: "0 auto", lineHeight: 1.6 }}>
            Заполните короткий опросник — это поможет нам настроить AI-анализ звонков под вашу
            компанию: подключить Bitrix24, телефонию, скрипты и отчёты. Займёт 5–7 минут.
          </p>
        </div>

        {done ? (
          /* Успех */
          <div
            style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.35)",
              borderRadius: 14,
              padding: "32px 28px",
              textAlign: "center",
            }}
          >
            <CheckCircle2 size={42} color="#22c55e" style={{ marginBottom: 14 }} />
            <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: C.fg }}>
              Спасибо! Заявка принята
            </h2>
            <p style={{ color: C.muted, fontSize: 15, margin: 0, lineHeight: 1.6 }}>
              Мы свяжемся с вами по указанным контактам и поможем с подключением.
            </p>
          </div>
        ) : (
          <>
            {/* 1. Компания */}
            <Section icon={Building2} title="1. О компании">
              <Field label="Название компании" required>
                <input
                  style={inputStyle}
                  value={f.company_name}
                  onChange={(e) => set("company_name", e.target.value)}
                  placeholder="ООО «Орлинк»"
                  maxLength={200}
                />
              </Field>
              <Field label="Контактное лицо" required>
                <input
                  style={inputStyle}
                  value={f.contact_name}
                  onChange={(e) => set("contact_name", e.target.value)}
                  placeholder="Иван Петров"
                />
              </Field>
              <Field label="Email" required>
                <input
                  style={inputStyle}
                  type="email"
                  value={f.contact_email}
                  onChange={(e) => set("contact_email", e.target.value)}
                  placeholder="ivan@company.ru"
                />
              </Field>
              <Field label="Телефон">
                <input
                  style={inputStyle}
                  value={f.contact_phone}
                  onChange={(e) => set("contact_phone", e.target.value)}
                  placeholder="+7 900 000-00-00"
                />
              </Field>
              <Field label="Ниша / сфера деятельности">
                <input
                  style={inputStyle}
                  value={f.niche}
                  onChange={(e) => set("niche", e.target.value)}
                  placeholder="Оптовая торговля стройматериалами"
                />
              </Field>
              <Field label="Часовой пояс">
                <input
                  style={inputStyle}
                  value={f.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                  placeholder="МСК (UTC+3)"
                />
              </Field>
            </Section>

            {/* 2. Bitrix24 */}
            <Section icon={Plug} title="2. Bitrix24">
              <Field label="URL портала Bitrix24" required hint="Например: company.bitrix24.ru">
                <input
                  style={inputStyle}
                  value={f.bitrix_url}
                  onChange={(e) => set("bitrix_url", e.target.value)}
                  placeholder="company.bitrix24.ru"
                />
              </Field>
              <Checkbox
                checked={f.webhook_ready}
                onChange={(v) => set("webhook_ready", v)}
                label="Входящий вебхук уже создан с правами telephony / crm / user / imbot / im / disk / mail"
              />
              <Field label="URL вебхука" hint="Если уже создали — вставьте сюда (необязательно)">
                <input
                  style={inputStyle}
                  value={f.webhook_url}
                  onChange={(e) => set("webhook_url", e.target.value)}
                  placeholder="https://company.bitrix24.ru/rest/1/xxxxxxxx/"
                />
              </Field>
              <Field label="Примечания по Bitrix">
                <textarea
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  rows={2}
                  value={f.bitrix_notes}
                  onChange={(e) => set("bitrix_notes", e.target.value)}
                  placeholder="Особенности портала, кто администратор и т.п."
                />
              </Field>
            </Section>

            {/* 3. Телефония */}
            <Section icon={Headphones} title="3. Телефония">
              <Field label="Тип телефонии">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "Встроенная телефония Bitrix24",
                    "Телфин",
                    "Манго",
                    "Другая АТС",
                  ].map((opt) => (
                    <Radio
                      key={opt}
                      name="telephony_type"
                      value={opt}
                      current={f.telephony_type}
                      onChange={(v) => set("telephony_type", v)}
                      label={opt}
                    />
                  ))}
                </div>
              </Field>
              {f.telephony_type === "Другая АТС" && (
                <Field label="Какая АТС?">
                  <input
                    style={inputStyle}
                    value={f.telephony_other}
                    onChange={(e) => set("telephony_other", e.target.value)}
                    placeholder="Название АТС"
                  />
                </Field>
              )}
            </Section>

            {/* 4. Команда */}
            <Section icon={Users} title="4. Команда">
              <Field label="Менеджеры" hint="По одному ФИО на строку">
                <textarea
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  rows={4}
                  value={f.managers_text}
                  onChange={(e) => set("managers_text", e.target.value)}
                  placeholder={"Иванов Иван\nПетрова Мария\nСидоров Пётр"}
                />
              </Field>
              <Field label="РОП / руководитель (ФИО)">
                <input
                  style={inputStyle}
                  value={f.head_name}
                  onChange={(e) => set("head_name", e.target.value)}
                  placeholder="Кузнецов Алексей"
                />
              </Field>
              <Field label="Кому слать отчёты">
                <input
                  style={inputStyle}
                  value={f.reports_recipient}
                  onChange={(e) => set("reports_recipient", e.target.value)}
                  placeholder="Руководителю отдела продаж"
                />
              </Field>
            </Section>

            {/* 5. Скрипт и чек-лист */}
            <Section icon={FileText} title="5. Скрипт и чек-лист">
              <Checkbox
                checked={f.has_script}
                onChange={(v) => set("has_script", v)}
                label="Есть готовый скрипт продаж"
              />
              <Field label="Продукты / направления" hint="Например: МП, МК">
                <textarea
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  rows={2}
                  value={f.products}
                  onChange={(e) => set("products", e.target.value)}
                  placeholder="Металлопрокат, металлоконструкции"
                />
              </Field>
              <Field label="Дополнительно о скрипте / чек-листе" hint="Описание или ссылка на файл">
                <textarea
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  rows={2}
                  value={f.script_notes}
                  onChange={(e) => set("script_notes", e.target.value)}
                  placeholder="Ссылка на Google Docs / описание этапов разговора"
                />
              </Field>
            </Section>

            {/* 6. Настройки анализа */}
            <Section icon={Settings} title="6. Настройки анализа">
              <Field label="Модель AI">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "Sonnet — максимальное качество",
                    "Haiku — экономия",
                    "Не знаю, выберите за меня",
                  ].map((opt) => (
                    <Radio
                      key={opt}
                      name="ai_model"
                      value={opt}
                      current={f.ai_model}
                      onChange={(v) => set("ai_model", v)}
                      label={opt}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Звонок считается состоявшимся от, сек">
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={f.contact_threshold}
                  onChange={(e) => set("contact_threshold", Number(e.target.value))}
                />
              </Field>
              <Checkbox
                checked={f.import_service}
                onChange={(v) => set("import_service", v)}
                label="Импортировать служебные / внутренние звонки"
              />
              <Field label="Импорт истории звонков">
                <select
                  style={inputStyle}
                  value={f.backfill_days}
                  onChange={(e) => set("backfill_days", e.target.value)}
                >
                  {["Не импортировать историю", "7 дней", "30 дней", "90 дней"].map((opt) => (
                    <option key={opt} value={opt} style={{ background: C.inputBg }}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>
            </Section>

            {/* 7. Отчёты */}
            <Section icon={BarChart3} title="7. Отчёты">
              <Field label="Частота отчётов">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {["Ежедневно", "Еженедельно", "Не нужно"].map((opt) => (
                    <Radio
                      key={opt}
                      name="report_frequency"
                      value={opt}
                      current={f.report_frequency}
                      onChange={(v) => set("report_frequency", v)}
                      label={opt}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Telegram для уведомлений" hint="Необязательно">
                <input
                  style={inputStyle}
                  value={f.telegram}
                  onChange={(e) => set("telegram", e.target.value)}
                  placeholder="@username"
                />
              </Field>
            </Section>

            {/* 8. CRM-запись и прочее */}
            <Section icon={MessageSquare} title="8. CRM-запись и прочее">
              <Checkbox
                checked={f.crm_write}
                onChange={(v) => set("crm_write", v)}
                label="Записывать анализ обратно в карточку сделки в Bitrix"
              />
              <Field
                label="Глоссарий названий"
                hint="Правильные написания названий и брендов, чтобы AI не путал. Например: «Орлинк, не Орлинг»"
              >
                <textarea
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  rows={3}
                  value={f.glossary}
                  onChange={(e) => set("glossary", e.target.value)}
                  placeholder={"Орлинк (не Орлинг, не Арлинк)\nназвания продуктов, аббревиатуры..."}
                />
              </Field>
              <Field label="Комментарии / пожелания">
                <textarea
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  rows={3}
                  value={f.comments}
                  onChange={(e) => set("comments", e.target.value)}
                  placeholder="Что-то ещё, что нам стоит знать"
                />
              </Field>
            </Section>

            {/* Ошибка */}
            {err && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.35)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 14,
                  color: "#fca5a5",
                  marginBottom: 16,
                }}
              >
                <AlertCircle size={18} style={{ flexShrink: 0 }} />
                {err}
              </div>
            )}

            {/* Кнопка отправки */}
            <button
              onClick={submit}
              disabled={busy}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 10,
                border: "none",
                cursor: busy ? "default" : "pointer",
                background: "linear-gradient(135deg,#5b4fc7,#a89ef0)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "inherit",
                opacity: busy ? 0.65 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {busy && <Loader2 size={17} className="spin" style={{ animation: "spin 1s linear infinite" }} />}
              {busy ? "Отправка..." : "Отправить заявку"}
            </button>

            <p style={{ textAlign: "center", color: C.faint, fontSize: 12, marginTop: 14 }}>
              Поля со звёздочкой (<span style={{ color: "#f87171" }}>*</span>) обязательны.
            </p>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
