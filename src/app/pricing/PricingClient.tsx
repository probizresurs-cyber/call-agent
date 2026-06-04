"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check, X, Zap, TrendingUp, Rocket, Building2,
  PhoneCall, ArrowRight, ChevronRight,
} from "lucide-react";

/* ─── Data ─────────────────────────────────────────────────── */

const PLANS = [
  {
    id: "start",
    name: "Старт",
    price: 3500,
    Icon: Zap,
    color: "#64748b",
    accent: "rgba(100,116,139,0.14)",
    border: "rgba(100,116,139,0.28)",
    calls: 200,
    meta: "1 тенант",
    popular: false,
    features: [
      [true,  "До 200 звонков в месяц"],
      [true,  "AI-транскрипция и анализ"],
      [true,  "Чек-лист качества QC"],
      [true,  "Дашборд по менеджерам"],
      [true,  "1 тенант"],
      [false, "Сравнение с Bitrix-карточкой"],
      [false, "Инбокс расхождений"],
      [false, "Геймификация"],
      [false, "API доступ"],
    ],
  },
  {
    id: "base",
    name: "Базовый",
    price: 5500,
    Icon: TrendingUp,
    color: "#7c70e0",
    accent: "rgba(124,112,224,0.13)",
    border: "rgba(124,112,224,0.45)",
    calls: 500,
    meta: "до 5 менеджеров",
    popular: true,
    features: [
      [true,  "До 500 звонков в месяц"],
      [true,  "AI-транскрипция и анализ"],
      [true,  "Чек-лист качества QC"],
      [true,  "До 5 менеджеров"],
      [true,  "Сравнение с Bitrix-карточкой"],
      [true,  "Инбокс расхождений"],
      [true,  "Публичный дашборд (ссылка)"],
      [false, "Геймификация"],
      [false, "API доступ"],
    ],
  },
  {
    id: "pro",
    name: "Про",
    price: 12000,
    Icon: Rocket,
    color: "#0ea5e9",
    accent: "rgba(14,165,233,0.11)",
    border: "rgba(14,165,233,0.38)",
    calls: 1500,
    meta: "до 20 менеджеров",
    popular: false,
    features: [
      [true,  "До 1 500 звонков в месяц"],
      [true,  "Всё из тарифа Базовый"],
      [true,  "До 20 менеджеров"],
      [true,  "Геймификация (лидерборд, ачивки)"],
      [true,  "Кабинет менеджера"],
      [true,  "Напоминания и follow-up"],
      [true,  "API доступ"],
    ],
  },
  {
    id: "business",
    name: "Бизнес",
    price: 30000,
    Icon: Building2,
    color: "#f59e0b",
    accent: "rgba(245,158,11,0.11)",
    border: "rgba(245,158,11,0.38)",
    calls: 5000,
    meta: "∞ менеджеров",
    popular: false,
    features: [
      [true,  "До 5 000 звонков в месяц"],
      [true,  "Всё из тарифа Про"],
      [true,  "Неограниченно менеджеров"],
      [true,  "Авто-запись в Bitrix (AI пишет сам)"],
      [true,  "Приоритетная поддержка"],
      [true,  "Выделенный онбординг"],
    ],
  },
] as const;

const COMPETITORS = [
  { name: "Call-Agent Базовый",          price: "5 500 ₽/мес",   ours: true  },
  { name: "MANGO Office Speech Analytics", price: "~15 000 ₽/мес", ours: false },
  { name: "Imot.io",                      price: "от 40 000 ₽/мес", ours: false },
  { name: "SalesAI",                      price: "от 49 000 ₽/мес", ours: false },
];

/* ─── Helpers ───────────────────────────────────────────────── */

function fmt(n: number) { return n.toLocaleString("ru-RU"); }

/* ─── Components ────────────────────────────────────────────── */

function PlanCard({
  plan, annual,
}: {
  plan: typeof PLANS[number];
  annual: boolean;
}) {
  const { Icon } = plan;
  const price = annual ? Math.round(plan.price * 0.8) : plan.price;
  const saving = fmt(Math.round(plan.price * 0.2 * 12));

  return (
    <div style={{
      background: plan.popular ? "rgba(124,112,224,0.06)" : "#0f1420",
      border: `1px solid ${plan.border}`,
      borderRadius: 16,
      padding: "26px 24px 24px",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      boxShadow: plan.popular ? "0 0 48px rgba(124,112,224,0.09)" : "none",
      transition: "transform 0.15s",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
    >
      {plan.popular && (
        <div style={{
          position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
          background: "linear-gradient(90deg,#5b4fc7,#a89ef0)",
          color: "#fff", fontSize: 11, fontWeight: 700,
          padding: "4px 18px", borderRadius: 20, whiteSpace: "nowrap",
          letterSpacing: "0.08em",
        }}>✦ ПОПУЛЯРНЫЙ</div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 20 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: plan.accent, border: `1px solid ${plan.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={17} color={plan.color} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{plan.name}</div>
          <div style={{ color: "#4b5563", fontSize: 12, marginTop: 2 }}>
            {plan.meta} · до {fmt(plan.calls)} зв/мес
          </div>
        </div>
      </div>

      {/* Price */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
          <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", color: plan.color }}>
            {fmt(price)}
          </span>
          <span style={{ color: "#4b5563", fontSize: 14 }}>₽/мес</span>
        </div>
        <div style={{ fontSize: 12, marginTop: 3, color: "#4b5563", minHeight: 18 }}>
          {annual
            ? <><s style={{ color: "#374151" }}>{fmt(plan.price)} ₽</s>{" "}· экономия <span style={{ color: "#a89ef0" }}>{saving} ₽/год</span></>
            : null}
        </div>
      </div>

      {/* Features */}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.features.map(([ok, text], i) => (
          <li key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            color: ok ? "#c9d1dc" : "#2d3748", fontSize: 13.5, lineHeight: 1.4,
          }}>
            {ok
              ? <Check size={14} color={plan.color} style={{ marginTop: 2, flexShrink: 0 }} />
              : <X size={14} color="#2d3748" style={{ marginTop: 2, flexShrink: 0 }} />
            }
            {text}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <Link href="/login" style={{
        display: "block", textAlign: "center",
        padding: "11px 0", borderRadius: 9,
        fontSize: 13.5, fontWeight: 600, textDecoration: "none",
        letterSpacing: "0.01em",
        ...(plan.popular
          ? { background: "linear-gradient(135deg,#5b4fc7,#a89ef0)", color: "#fff", border: "none" }
          : { background: plan.accent, border: `1px solid ${plan.border}`, color: plan.color }),
      }}>
        Попробовать 14 дней бесплатно
      </Link>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────── */

export default function PricingClient() {
  const [annual, setAnnual] = useState(false);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0f14",
      color: "#e8eaf0",
      fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif",
      padding: "64px 20px 88px",
    }}>

      {/* Nav */}
      <div style={{
        maxWidth: 1160, margin: "0 auto 52px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap",
      }}>
        <Link href="/" style={{
          display: "flex", alignItems: "center", gap: 8,
          textDecoration: "none", color: "#e8eaf0",
          fontWeight: 700, fontSize: 16,
        }}>
          <PhoneCall size={18} color="#7c70e0" />
          Call-Agent
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/dashboard" style={{
            padding: "7px 16px", borderRadius: 8, border: "1px solid #1f2535",
            color: "#6b7280", fontSize: 13, textDecoration: "none", fontWeight: 500,
          }}>
            Войти
          </Link>
          <Link href="/login" style={{
            padding: "7px 16px", borderRadius: 8,
            background: "#7c70e0", color: "#fff",
            fontSize: 13, textDecoration: "none", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 5,
          }}>
            Начать бесплатно <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "rgba(124,112,224,0.1)", border: "1px solid rgba(124,112,224,0.25)",
          borderRadius: 20, padding: "5px 14px", fontSize: 13,
          color: "#a89ef0", marginBottom: 22,
        }}>
          <PhoneCall size={13} />
          AI-анализ звонков, встреч и переписок
        </div>

        <h1 style={{
          fontSize: "clamp(30px,5vw,50px)", fontWeight: 800,
          letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 14,
          background: "linear-gradient(135deg,#e8eaf0 30%,#a89ef0 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          Простые тарифы.<br />Без скрытых платежей.
        </h1>

        <p style={{ color: "#6b7280", fontSize: 16, maxWidth: 460, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Контроль качества звонков, AI-чеклисты и сравнение с Bitrix-карточкой.
          Платите за результат.
        </p>

        {/* Toggle */}
        <div style={{
          display: "inline-flex", gap: 4, padding: 5,
          background: "#161b26", border: "1px solid #1f2535", borderRadius: 10,
        }}>
          {([["Помесячно", false], ["Годовой", true]] as [string, boolean][]).map(([label, val]) => (
            <button key={label} onClick={() => setAnnual(val)} style={{
              padding: "7px 18px", borderRadius: 7, border: "none", cursor: "pointer",
              background: annual === val ? "#1e2a3a" : "transparent",
              color: annual === val ? "#e8eaf0" : "#6b7280",
              fontWeight: annual === val ? 600 : 400, fontSize: 14,
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7,
              transition: "all 0.15s",
            }}>
              {label}
              {val && (
                <span style={{
                  background: "rgba(124,112,224,0.2)", color: "#a89ef0",
                  fontSize: 11, padding: "2px 7px", borderRadius: 5, fontWeight: 700,
                }}>−20%</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(255px,1fr))",
        gap: 18, maxWidth: 1160, margin: "0 auto 72px",
        alignItems: "start",
      }}>
        {PLANS.map(plan => (
          <PlanCard key={plan.id} plan={plan} annual={annual} />
        ))}
      </div>

      {/* Notes */}
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <p style={{ color: "#4b5563", fontSize: 14, marginBottom: 5 }}>
          📞 Встречи, чаты, email — тоже анализируем. Не только звонки.
        </p>
        <p style={{ color: "#374151", fontSize: 13 }}>
          Себестоимость анализа одного звонка от{" "}
          <span style={{ color: "#a89ef0", fontWeight: 600 }}>4.6 ₽</span>
          {" "}— при 500 звонках/мес
        </p>
      </div>

      {/* Comparison */}
      <div style={{ maxWidth: 680, margin: "0 auto 72px" }}>
        <h2 style={{
          textAlign: "center", fontSize: 20, fontWeight: 700,
          marginBottom: 28, color: "#6b7280", letterSpacing: "-0.01em",
        }}>
          Сравнение с альтернативами
        </h2>
        <div style={{
          background: "#0f1420", border: "1px solid #1a2030",
          borderRadius: 14, overflow: "hidden",
        }}>
          {COMPETITORS.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "16px 24px",
              background: c.ours ? "rgba(124,112,224,0.07)" : "transparent",
              borderBottom: i < COMPETITORS.length - 1 ? "1px solid #1a2030" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {c.ours && (
                  <span style={{
                    background: "rgba(124,112,224,0.2)", color: "#a89ef0",
                    fontSize: 10, padding: "2px 8px", borderRadius: 5,
                    fontWeight: 700, letterSpacing: "0.06em",
                  }}>ВЫ</span>
                )}
                <span style={{
                  fontSize: 14,
                  color: c.ours ? "#d1d5db" : "#4b5563",
                  fontWeight: c.ours ? 600 : 400,
                }}>
                  {c.name}
                </span>
              </div>
              <span style={{
                fontWeight: 700, fontSize: 15,
                color: c.ours ? "#a89ef0" : "#2d3748",
              }}>{c.price}</span>
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", color: "#2d3748", fontSize: 12, marginTop: 12 }}>
          При сопоставимых функциях. Цены конкурентов — открытые данные, 2026 г.
        </p>
      </div>

      {/* FAQ strip */}
      <div style={{
        maxWidth: 760, margin: "0 auto 72px",
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20,
      }}>
        {[
          ["Есть ли ограничение по длине звонка?", "Нет. Анализируем звонки любой длины — от 30 секунд до нескольких часов."],
          ["Можно подключить несколько менеджеров?", "Да, начиная с тарифа Базовый. Каждый видит только свои звонки."],
          ["Что если превышу лимит звонков?", "Новые звонки встанут в очередь. Мы уведомим и предложим доп. пакет."],
          ["Нужна ли интеграция с Bitrix24?", "Нет, платформа работает и без CRM — можно загружать записи вручную."],
        ].map(([q, a]) => (
          <div key={q} style={{
            background: "#0f1420", border: "1px solid #1a2030",
            borderRadius: 12, padding: "18px 20px",
          }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#c9d1dc" }}>{q}</div>
            <div style={{ color: "#4b5563", fontSize: 13, lineHeight: 1.6 }}>{a}</div>
          </div>
        ))}
      </div>

      {/* CTA banner */}
      <div style={{
        maxWidth: 640, margin: "0 auto 64px",
        background: "linear-gradient(135deg,rgba(91,79,199,0.2),rgba(124,112,224,0.08))",
        border: "1px solid rgba(124,112,224,0.3)",
        borderRadius: 18, padding: "36px 32px", textAlign: "center",
      }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10, letterSpacing: "-0.02em" }}>
          14 дней бесплатно
        </h2>
        <p style={{ color: "#6b7280", fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>
          Без карты. Без обязательств. Подключите Bitrix24 и загрузите первые звонки за 15 минут.
        </p>
        <Link href="/login" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "linear-gradient(135deg,#5b4fc7,#a89ef0)",
          color: "#fff", padding: "12px 28px", borderRadius: 10,
          fontWeight: 700, fontSize: 15, textDecoration: "none",
          letterSpacing: "0.01em",
        }}>
          Начать бесплатно <ChevronRight size={16} />
        </Link>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#2d3748", fontSize: 13, lineHeight: 1.7 }}>
          Нет ограничений по длине звонка · Нет платы за пользователей · Нет скрытых надбавок
        </p>
        <p style={{ color: "#2d3748", fontSize: 13, marginTop: 8 }}>
          Вопросы?{" "}
          <a href="mailto:hello@marketradar24.ru" style={{ color: "#a89ef0", textDecoration: "none" }}>
            hello@marketradar24.ru
          </a>
        </p>
      </div>
    </div>
  );
}
