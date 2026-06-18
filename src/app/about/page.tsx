/**
 * Публичная промо-страница Call-Agent — hero-блок «боль» + обещание + CTA.
 * Доступна без авторизации по /call-agent/about. В стиле платформы
 * (CSS-переменные темы + бренд #7c70e0). Статичная (server component).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { PhoneCall, ArrowRight, Sparkles, ClipboardCheck, Scale, BarChart3 } from "lucide-react";

export const metadata: Metadata = {
  title: "Call-Agent — вы слышите все продажи? | AI-контроль звонков",
  description:
    "Сотни звонков в неделю, а руководитель слышит два-три. Call-Agent разбирает каждый звонок, чат и встречу нейросетью и показывает всю картину продаж. Демо открыто.",
  openGraph: {
    title: "Сотни звонков. А слышно — три.",
    description: "Call-Agent слушает за вас: AI-разбор каждого звонка по вашему скрипту. Контроль продаж на фактах.",
    type: "website",
  },
};

const BRAND = "#7c70e0";

export default function AboutPage() {
  // 40 «звонков» за неделю — подсвечены только 3 (те, что реально услышал РОП).
  const CALLS = Array.from({ length: 40 }, (_, i) => i);
  const HEARD = new Set([7, 19, 31]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--foreground)",
        padding: "0 20px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* ── Шапка ── */}
        <header
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "22px 0", flexWrap: "wrap", gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38, height: 38, borderRadius: 10, background: BRAND,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <PhoneCall size={20} color="#fff" strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1 }}>Call-Agent</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>
                AI-контроль качества продаж
              </div>
            </div>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 14 }}>
            <Link href="/pricing" style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>
              Тарифы
            </Link>
            <Link
              href="/demo"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: BRAND, color: "#fff", padding: "9px 16px",
                borderRadius: 9, fontWeight: 600, textDecoration: "none",
              }}
            >
              Открыть демо <ArrowRight size={15} />
            </Link>
          </nav>
        </header>

        {/* ── HERO: блок «боль» ── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.15fr) minmax(0,0.85fr)",
            gap: 48,
            alignItems: "center",
            padding: "48px 0 64px",
          }}
          className="about-hero"
        >
          {/* Левая колонка — текст */}
          <div>
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
                color: BRAND, borderRadius: 999, padding: "6px 14px",
                fontSize: 13, fontWeight: 600, marginBottom: 22,
              }}
            >
              <Sparkles size={14} /> Контроль продаж на фактах, а не на ощущениях
            </div>

            <h1
              style={{
                fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.05, fontWeight: 800,
                margin: "0 0 22px", letterSpacing: "-0.02em",
              }}
            >
              Сотни звонков.<br />
              А слышит руководитель —{" "}
              <span style={{ color: BRAND }}>три.</span>
            </h1>

            <p
              style={{
                fontSize: "clamp(16px, 1.7vw, 19px)", lineHeight: 1.6,
                color: "var(--muted-foreground)", margin: "0 0 14px", maxWidth: 560,
              }}
            >
              У вашего отдела продаж — <b style={{ color: "var(--foreground)" }}>сотни звонков в неделю</b>.
              Сколько из них реально слышал руководитель? Два-три. Остальное — на ощущениях.
            </p>
            <p
              style={{
                fontSize: "clamp(16px, 1.7vw, 19px)", lineHeight: 1.6,
                color: "var(--muted-foreground)", margin: "0 0 32px", maxWidth: 560,
              }}
            >
              Менеджер обещал скидку, не отработал возражение, забыл перезвонить — и сделка тихо умерла.
              А РОП узнаёт об этом <b style={{ color: "var(--foreground)" }}>через неделю на планёрке</b>.
              Если вообще узнаёт.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/demo"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: BRAND, color: "#fff", padding: "13px 24px",
                  borderRadius: 11, fontWeight: 700, fontSize: 16, textDecoration: "none",
                }}
              >
                Посмотреть демо <ArrowRight size={18} />
              </Link>
              <Link
                href="/pricing"
                style={{
                  display: "inline-flex", alignItems: "center",
                  background: "var(--card)", color: "var(--foreground)",
                  border: "1px solid var(--border)", padding: "13px 24px",
                  borderRadius: 11, fontWeight: 600, fontSize: 16, textDecoration: "none",
                }}
              >
                Тарифы
              </Link>
            </div>
          </div>

          {/* Правая колонка — визуализация «слышно только 3 из 40» */}
          <div
            style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 18, padding: 28,
            }}
          >
            <div
              style={{
                display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10,
                marginBottom: 18,
              }}
            >
              {CALLS.map((i) => {
                const heard = HEARD.has(i);
                return (
                  <div
                    key={i}
                    title={heard ? "Услышан руководителем" : "Никто не слушал"}
                    style={{
                      aspectRatio: "1", borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: heard ? BRAND : "color-mix(in oklch, var(--muted-foreground) 12%, transparent)",
                      border: heard ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <PhoneCall
                      size={13}
                      color={heard ? "#fff" : "var(--muted-foreground)"}
                      strokeWidth={2}
                      style={{ opacity: heard ? 1 : 0.45 }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              <span style={{ color: BRAND, fontWeight: 700 }}>■</span> — звонки, которые реально услышал РОП.
              Остальные <b style={{ color: "var(--foreground)" }}>37 из 40</b> — чёрный ящик.
            </div>
          </div>
        </section>

        {/* ── Обещание ── */}
        <section
          style={{
            textAlign: "center", padding: "8px 0 56px", maxWidth: 760, margin: "0 auto",
          }}
        >
          <h2 style={{ fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 800, margin: "0 0 16px", lineHeight: 1.2 }}>
            Call-Agent <span style={{ color: BRAND }}>слушает за вас</span>
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted-foreground)", margin: 0 }}>
            Каждый звонок, чат, письмо и встречу — расшифровывает, разбирает нейросетью по вашему скрипту
            и показывает руководителю всю картину продаж как на ладони. Без прослушки. Без планёрок ради контроля.
          </p>
        </section>

        {/* ── 4 фишки ── */}
        <section
          style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 18, paddingBottom: 64,
          }}
        >
          {[
            { Icon: ClipboardCheck, t: "Разбор каждого звонка", d: "Оценка по скрипту, чек-лист качества, тональность, возражения и следующий шаг — через минуту после разговора." },
            { Icon: Scale, t: "Сверка с CRM", d: "Система ловит расхождения между разговором и карточкой сделки. Деньги перестают теряться между словами и CRM." },
            { Icon: BarChart3, t: "Картина у РОПа", d: "Видно каждого менеджера, кто проседает и какой пункт скрипта команда проваливает чаще всего." },
            { Icon: Sparkles, t: "Всё в одном месте", d: "Звонки, мессенджеры, почта и встречи. Профиль клиента 360. Bitrix24 / amoCRM. Автоотчёты в чат каждое утро." },
          ].map(({ Icon, t, d }) => (
            <div
              key={t}
              style={{
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 14, padding: 24,
              }}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: 11, marginBottom: 16,
                  background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon size={22} color={BRAND} strokeWidth={2} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px" }}>{t}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted-foreground)", margin: 0 }}>{d}</p>
            </div>
          ))}
        </section>

        {/* ── Финальный CTA ── */}
        <section
          style={{
            background: BRAND, borderRadius: 20, padding: "48px 32px",
            textAlign: "center", marginBottom: 64,
          }}
        >
          <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>
            Посмотрите, как это выглядит на ваших данных
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", margin: "0 0 28px", lineHeight: 1.5 }}>
            Откройте демо — это живой дашборд с разбором звонков. Без регистрации.
          </p>
          <Link
            href="/demo"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#fff", color: BRAND, padding: "14px 30px",
              borderRadius: 12, fontWeight: 800, fontSize: 17, textDecoration: "none",
            }}
          >
            Открыть демо <ArrowRight size={19} />
          </Link>
        </section>
      </div>

      {/* Адаптив: на узком экране hero в одну колонку */}
      <style>{`
        @media (max-width: 820px) {
          .about-hero { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
      `}</style>
    </main>
  );
}
