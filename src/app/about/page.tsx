/**
 * Публичный продающий лендинг Call-Agent — полный одностраничник.
 * Доступен без авторизации по /call-agent/about. В стиле платформы
 * (CSS-переменные темы + бренд #7c70e0, lucide-иконки, адаптив).
 *
 * Секции: Hero → Проблема → (абзац-решение) → Как работает → Что умеет →
 * Что получает бизнес → Для кого → Почему Call-Agent (таблица) → Тарифы →
 * Частые вопросы → Форма заявки (#request-demo, ContactForm) → Финальный CTA → Футер.
 * Cookie-баннер подключён внизу.
 *
 * Server component; интерактив вынесен в ContactForm.tsx и CookieBanner.tsx.
 * Все CTA ведут на якорь #request-demo (демо-флоу).
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  PhoneCall, ArrowRight, Sparkles, ClipboardCheck, Scale, BarChart3,
  Download, FileText, BrainCircuit, LayoutDashboard, MessagesSquare,
  Tv, Trophy, TrendingUp, Clock, ShieldCheck, Database,
  ChevronRight, HelpCircle, FileCheck2, BellRing, Check, X, Building2,
} from "lucide-react";
import ContactForm from "./ContactForm";
import CookieBanner from "../_components/CookieBanner";

export const metadata: Metadata = {
  title: "Call-Agent — AI-контроль каждого звонка отдела продаж",
  description:
    "Ваш отдел продаж делает сотни звонков в неделю — все прослушать невозможно. Call-Agent слушает за вас: AI разбирает каждый звонок и встречу по вашему скрипту, ловит расхождения с CRM и показывает руководителю всю картину продаж на одном дашборде. Внедрение за 1 день, 3 дня бесплатно.",
  openGraph: {
    title: "Сотни звонков. А слышит руководитель — три.",
    description:
      "Call-Agent слушает за вас: AI-разбор каждого звонка по вашему скрипту, сверка с CRM, дашборд руководителя и автоотчёты. Контроль продаж на фактах.",
    type: "website",
    siteName: "Call-Agent",
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
            <a href="#features" style={{ color: "var(--muted-foreground)", textDecoration: "none" }} className="nav-hide-mobile">
              Возможности
            </a>
            <Link href="/pricing" style={{ color: "var(--muted-foreground)", textDecoration: "none" }}>
              Тарифы
            </Link>
            <a
              href="#request-demo"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: BRAND, color: "#fff", padding: "9px 16px",
                borderRadius: 9, fontWeight: 600, textDecoration: "none",
              }}
            >
              Запросить демо <ArrowRight size={15} />
            </a>
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
              Ваш отдел продаж делает <b style={{ color: "var(--foreground)" }}>сотни, а то и тысячи звонков в неделю</b>.
              Все прослушать невозможно.
            </p>
            <p
              style={{
                fontSize: "clamp(16px, 1.7vw, 19px)", lineHeight: 1.6,
                color: "var(--muted-foreground)", margin: "0 0 14px", maxWidth: 560,
              }}
            >
              Call-Agent слушает за вас. AI разбирает каждый звонок и встречу, показывает,
              кто как продаёт, где теряются сделки и что улучшить — <b style={{ color: "var(--foreground)" }}>без ручной прослушки</b>.
            </p>
            <p
              style={{
                fontSize: "clamp(16px, 1.7vw, 19px)", lineHeight: 1.6,
                color: "var(--muted-foreground)", margin: "0 0 32px", maxWidth: 560,
              }}
            >
              Весь отдел на одном дашборде. Всё под контролем.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a
                href="#request-demo"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: BRAND, color: "#fff", padding: "13px 24px",
                  borderRadius: 11, fontWeight: 700, fontSize: 16, textDecoration: "none",
                }}
              >
                Запросить демонстрацию <ArrowRight size={18} />
              </a>
              <a
                href="#request-demo"
                style={{
                  display: "inline-flex", alignItems: "center",
                  background: "var(--card)", color: "var(--foreground)",
                  border: "1px solid var(--border)", padding: "13px 24px",
                  borderRadius: 11, fontWeight: 600, fontSize: 16, textDecoration: "none",
                }}
              >
                Получить демо-доступ
              </a>
            </div>

            {/* Строка доверия */}
            <div
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
                marginTop: 20, fontSize: 13.5, color: "var(--muted-foreground)",
              }}
            >
              <span>Bitrix24, amoCRM и любая другая CRM</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>Внедрение за 1 день</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>3 дня бесплатно</span>
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

        {/* ── ПРОБЛЕМА ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Проблема"
            title={<>Контроль продаж вслепую <span style={{ color: BRAND }}>стоит вам сделок</span></>}
            subtitle="Пока вы не слышите разговоры целиком, отдел продаж — это чёрный ящик. Вот что в нём прячется."
          />
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 18, marginTop: 36,
            }}
          >
            {[
              {
                t: "РОП не успевает слушать",
                d: "РОП физически не успевает прослушать сотни звонков — а решения приходится принимать по тем немногим, что услышал.",
              },
              {
                t: "Сделки теряются",
                d: "Менеджер не отработал возражение, пообещал лишнее, забыл перезвонить — и сделка потерялась.",
              },
              {
                t: "CRM не сходится с реальностью",
                d: "В CRM записано одно, в разговоре прозвучало другое — и часть важного просто не доходит до карточки.",
              },
            ].map((p) => (
              <div
                key={p.t}
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 14, padding: 24,
                  borderLeft: `3px solid ${BRAND}`,
                }}
              >
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 10px" }}>{p.t}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--muted-foreground)", margin: 0 }}>
                  {p.d}
                </p>
              </div>
            ))}
          </div>
          {/* Итоговая строка-акцент */}
          <p
            style={{
              maxWidth: 760, margin: "28px auto 0", textAlign: "center",
              fontSize: "clamp(17px, 2vw, 21px)", lineHeight: 1.5, fontWeight: 700,
            }}
          >
            А узнаёте вы об этом, когда сделка уже потеряна.{" "}
            <span style={{ color: BRAND }}>Вы не можете управлять тем, чего не видите.</span>
          </p>
        </section>

        {/* ── АБЗАЦ-РЕШЕНИЕ ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <div
            style={{
              maxWidth: 860, margin: "0 auto",
              background: "color-mix(in oklch, var(--primary) 6%, var(--card))",
              border: `1px solid color-mix(in oklch, var(--primary) 30%, var(--border))`,
              borderRadius: 18, padding: "32px 32px",
            }}
          >
            <p
              style={{
                fontSize: "clamp(16px, 1.8vw, 19px)", lineHeight: 1.65,
                margin: 0, color: "var(--foreground)",
              }}
            >
              Система сама забирает из CRM все звонки и встречи менеджеров, расшифровывает их
              и разбирает нейросетью по вашему скрипту и чек-листу. Руководитель видит объективную
              картину продаж целиком. Менеджеру больше не нужно вносить записи руками — система
              заносит то, что реально прозвучало в разговоре. Данные честные, а у менеджера
              освободилось время на продажи.{" "}
              <b style={{ color: BRAND }}>100% разговоров под контролем</b> — не выборочно,
              а каждый разговор.
            </p>
          </div>
        </section>

        {/* ── КАК РАБОТАЕТ ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Как это работает"
            title={<>Поток за <span style={{ color: BRAND }}>4 шага</span></>}
            subtitle="Менеджеры ничего не делают руками — анализ идёт фоном. Каждые несколько минут."
          />
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 18, marginTop: 36,
            }}
          >
            {[
              { Icon: Download, n: "01", t: "Забор", d: "Звонки и встречи подтягиваются из вашей CRM или телефонии автоматически. Записи можно загрузить и вручную." },
              { Icon: FileText, n: "02", t: "Расшифровка", d: "Аудио превращается в текст с разделением реплик «менеджер / клиент»." },
              { Icon: BrainCircuit, n: "03", t: "AI-анализ", d: "Нейросеть оценивает разговор по вашему скрипту: оценка, чек-лист, тональность, возражения, следующий шаг." },
              { Icon: BarChart3, n: "04", t: "Результат", d: "Дашборд для руководителя, итог в карточку сделки, автоотчёты в мессенджер." },
            ].map(({ Icon, n, t, d }) => (
              <div
                key={n}
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 14, padding: 24, position: "relative",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: BRAND, letterSpacing: "0.06em", marginBottom: 14 }}>
                  ШАГ {n}
                </div>
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 11, marginBottom: 14,
                    background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon size={22} color={BRAND} strokeWidth={2} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{t}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted-foreground)", margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ЧТО УМЕЕТ ── */}
        <section id="features" style={{ padding: "8px 0 64px", scrollMarginTop: 24 }}>
          <SectionHeading
            kicker="Что умеет"
            title={<>Всё, что нужно для <span style={{ color: BRAND }}>контроля качества</span></>}
            subtitle="100% разговоров под контролем — а не случайная выборка."
          />
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 18, marginTop: 36,
            }}
          >
            {[
              { Icon: ClipboardCheck, t: "Разбор каждого разговора", d: "Оценка менеджера 0–10, чек-лист по пунктам, тональность, возражения, следующий шаг и персональные подсказки — через минуту после звонка." },
              { Icon: LayoutDashboard, t: "Дашборд руководителя", d: "Метрики по каждому менеджеру: кто держит планку, кто проседает, какой пункт скрипта команда проваливает чаще всего." },
              { Icon: Scale, t: "Сверка с CRM", d: "Находит расхождения между разговором и карточкой: в CRM 150 000, а в разговоре согласовали 250 000 — раньше эти деньги терялись, теперь расхождение видно сразу." },
              { Icon: FileCheck2, t: "Скрипт и чек-лист под вас", d: "Загружаете свой скрипт и стандарт качества — система оценивает именно по нему. Нет жёсткого скрипта? Можно оценивать по структуре разговора, без привязки к точным формулировкам." },
              { Icon: BellRing, t: "Автоматические отчёты", d: "Сводка по команде каждое утро прямо в чат, по расписанию. Не нужно запрашивать и ждать. А менеджеры больше не тратят время на ручные отчёты." },
              { Icon: Trophy, t: "Мотивация команды", d: "Лидерборд, рейтинг менеджеров, личный кабинет с зонами роста." },
              { Icon: Tv, t: "ТВ-табло", d: "Показатели отдела на экране в офисе, рейтинг менеджеров крупно, в реальном времени." },
              { Icon: MessagesSquare, t: "Больше каналов", d: "Чаты, почта и переписка в CRM — система будет так же разбирать и оценивать их, не только звонки и встречи.", soon: true },
            ].map(({ Icon, t, d, soon }) => (
              <div
                key={t}
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 14, padding: 24, position: "relative",
                }}
              >
                {soon && (
                  <div
                    style={{
                      position: "absolute", top: 16, right: 16,
                      background: "color-mix(in oklch, var(--primary) 16%, var(--card))",
                      color: BRAND, fontSize: 11, fontWeight: 700,
                      padding: "3px 10px", borderRadius: 20, letterSpacing: "0.04em",
                    }}
                  >
                    СКОРО
                  </div>
                )}
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 11, marginBottom: 16,
                    background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon size={22} color={BRAND} strokeWidth={2} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{t}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted-foreground)", margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ЧТО ПОЛУЧАЕТ БИЗНЕС ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Результат"
            title={<>Что получает <span style={{ color: BRAND }}>бизнес</span></>}
            subtitle="Не «ещё один дашборд», а деньги, время и единый стандарт продаж."
          />
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 18, marginTop: 36,
            }}
          >
            {[
              { Icon: TrendingUp, t: "Больше выручки", d: "Сделки перестают теряться там, где раньше вы даже не знали, что их теряете." },
              { Icon: Clock, t: "Свободное время РОПа", d: "Никакой ручной прослушки, разбор готов автоматически." },
              { Icon: ShieldCheck, t: "Единый стандарт", d: "Все менеджеры оцениваются по одной планке, объективно." },
              { Icon: Trophy, t: "Рост команды", d: "Каждый видит свои зоны роста, РОП — общие слабые места." },
              { Icon: Database, t: "Чистая CRM", d: "Данные берутся прямо из разговоров, ничего не теряется и не искажается." },
            ].map(({ Icon, t, d }) => (
              <div
                key={t}
                style={{
                  display: "flex", gap: 16, alignItems: "flex-start",
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 14, padding: 22,
                }}
              >
                <div
                  style={{
                    width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                    background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon size={22} color={BRAND} strokeWidth={2} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{t}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--muted-foreground)", margin: 0 }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── ДЛЯ КОГО ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <div
            style={{
              maxWidth: 860, margin: "0 auto",
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 18, padding: "32px",
              display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Building2 size={24} color={BRAND} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div
                style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: BRAND, marginBottom: 10,
                }}
              >
                Для кого
              </div>
              <p style={{ fontSize: "clamp(16px, 1.7vw, 18px)", lineHeight: 1.6, margin: 0 }}>
                Для любого отдела продаж, где основной канал — телефон. Чем больше звонков,
                тем больше теряется без контроля — и тем нужнее Call-Agent. Подключаемся
                к любой CRM или напрямую к телефонии.
              </p>
            </div>
          </div>
        </section>

        {/* ── ПОЧЕМУ CALL-AGENT (сравнение) ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Сравнение"
            title={<>Почему <span style={{ color: BRAND }}>Call-Agent</span></>}
            subtitle="Ручной контроль против AI-разбора каждого разговора."
          />
          <div
            style={{
              maxWidth: 860, margin: "36px auto 0",
              border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden",
            }}
            className="compare-table"
          >
            {/* Шапка таблицы */}
            <div
              style={{
                display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr",
                background: "var(--card)", borderBottom: "1px solid var(--border)",
                fontWeight: 700, fontSize: 14,
              }}
              className="compare-row compare-head"
            >
              <div style={{ padding: "16px 18px", color: "var(--muted-foreground)" }}>Параметр</div>
              <div style={{ padding: "16px 18px", color: "var(--muted-foreground)" }}>Ручной контроль</div>
              <div
                style={{
                  padding: "16px 18px", color: "#fff", background: BRAND,
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <PhoneCall size={16} strokeWidth={2.4} /> Call-Agent
              </div>
            </div>
            {[
              { p: "Охват", manual: "2–3 звонка из сотен", ca: "100% разговоров" },
              { p: "Скорость", manual: "разбор раз в неделю", ca: "через минуту после звонка" },
              { p: "Объективность", manual: "вслепую", ca: "единый чек-лист, цифры" },
              { p: "Данные в CRM", manual: "теряются", ca: "сверка расхождений" },
              { p: "Формат", manual: "табличка", ca: "дашборд" },
            ].map((row, i, arr) => (
              <div
                key={row.p}
                style={{
                  display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  fontSize: 14.5,
                }}
                className="compare-row"
              >
                <div style={{ padding: "16px 18px", fontWeight: 600 }} data-label="Параметр">{row.p}</div>
                <div
                  style={{ padding: "16px 18px", color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 8 }}
                  data-label="Ручной контроль"
                >
                  <X size={15} style={{ flexShrink: 0, opacity: 0.6 }} />
                  {row.manual}
                </div>
                <div
                  style={{
                    padding: "16px 18px", fontWeight: 600,
                    background: "color-mix(in oklch, var(--primary) 7%, transparent)",
                    color: "var(--foreground)", display: "flex", alignItems: "center", gap: 8,
                  }}
                  data-label="Call-Agent"
                >
                  <Check size={15} color={BRAND} strokeWidth={3} style={{ flexShrink: 0 }} />
                  {row.ca}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── ТАРИФЫ (кратко) ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Тарифы"
            title={<>Прозрачно, <span style={{ color: BRAND }}>от 3 500 ₽/мес</span></>}
            subtitle="Без скрытых платежей и платы за пользователей. 14 дней бесплатно."
          />
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16, marginTop: 36,
            }}
          >
            {[
              { name: "Старт", price: "3 500", meta: "до 200 звонков · 1 тенант", popular: false },
              { name: "Базовый", price: "5 500", meta: "до 500 звонков · до 5 менеджеров", popular: true },
              { name: "Про", price: "12 000", meta: "до 1 500 звонков · до 20 менеджеров", popular: false },
              { name: "Бизнес", price: "30 000", meta: "до 5 000 звонков · ∞ менеджеров", popular: false },
            ].map((p) => (
              <div
                key={p.name}
                style={{
                  background: p.popular ? "color-mix(in oklch, var(--primary) 7%, var(--card))" : "var(--card)",
                  border: p.popular ? `1.5px solid ${BRAND}` : "1px solid var(--border)",
                  borderRadius: 14, padding: 22, position: "relative",
                }}
              >
                {p.popular && (
                  <div
                    style={{
                      position: "absolute", top: -11, left: 20,
                      background: BRAND, color: "#fff", fontSize: 11, fontWeight: 700,
                      padding: "3px 12px", borderRadius: 20, letterSpacing: "0.04em",
                    }}
                  >
                    ПОПУЛЯРНЫЙ
                  </div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, color: BRAND, letterSpacing: "-0.02em" }}>
                    {p.price}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>₽/мес</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{p.meta}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <Link
              href="/pricing"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "var(--card)", color: "var(--foreground)",
                border: "1px solid var(--border)", padding: "12px 24px",
                borderRadius: 11, fontWeight: 600, fontSize: 15, textDecoration: "none",
              }}
            >
              Подробнее о тарифах <ChevronRight size={16} />
            </Link>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Вопросы"
            title={<>Частые <span style={{ color: BRAND }}>вопросы</span></>}
            subtitle="Снимаем главные возражения перед стартом."
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 36, maxWidth: 820, marginLeft: "auto", marginRight: "auto" }}>
            {[
              {
                q: "У меня маленький отдел, мне не до аналитики",
                a: "Даже с одним-двумя менеджерами видно, кто и где теряет деньги. Окупается с первой же спасённой сделки.",
              },
              {
                q: "Сложно внедрять?",
                a: "Нет, всё на нас. Настройку под вашу компанию делаем за день. Подключение к телефонии или CRM занимает около 30 минут — нужен только ваш технический специалист или доступы для подключения. Менеджеры не меняют свою работу: продолжают звонить, никто даже не заметит, как анализ уже идёт фоном.",
              },
              {
                q: "А если у нас своя CRM?",
                a: "Работаем с Bitrix24 и amoCRM из коробки, с любыми другими — на подключении. А если CRM нет, подключаемся прямо к кабинету телефонии.",
              },
              {
                q: "Это законно? А персональные данные?",
                a: "Все записи и расшифровки хранятся на серверах в РФ, а по запросу разворачиваем систему прямо на сервере вашей компании — данные не покидают контур РФ или ваших серверов. Вопросы согласия на запись закроем при настройке.",
              },
            ].map((item) => (
              <details
                key={item.q}
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 12, padding: "16px 20px",
                }}
              >
                <summary
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: 15.5, fontWeight: 600, cursor: "pointer", listStyle: "none",
                  }}
                >
                  <HelpCircle size={18} color={BRAND} style={{ flexShrink: 0 }} />
                  {item.q}
                </summary>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--muted-foreground)", margin: "12px 0 0", paddingLeft: 28 }}>
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── ФОРМА ЗАЯВКИ → демо-доступ ── */}
        <section id="request-demo" style={{ padding: "8px 0 64px", scrollMarginTop: 24 }}>
          <SectionHeading
            kicker="Демо-доступ"
            title={<>Запросить <span style={{ color: BRAND }}>демо</span></>}
            subtitle="Оставьте контакты — и сразу откроется живой демо-дашборд с разбором звонков. Телефон обязателен: по нему мы свяжемся и поможем подключить ваш отдел продаж."
          />
          <div style={{ maxWidth: 620, margin: "36px auto 0" }}>
            <ContactForm />
          </div>
        </section>

        {/* ── Финальный CTA ── */}
        <section
          style={{
            background: BRAND, borderRadius: 20, padding: "48px 32px",
            textAlign: "center", marginBottom: 64,
          }}
        >
          <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>
            Узнайте, сколько сделок вы теряете прямо сейчас.
          </h2>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", margin: "0 0 28px", lineHeight: 1.5 }}>
            Подключение — за один день. Call-Agent — контроль продаж на фактах.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <a
              href="#request-demo"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "#fff", color: BRAND, padding: "14px 30px",
                borderRadius: 12, fontWeight: 800, fontSize: 17, textDecoration: "none",
              }}
            >
              Запросить демонстрацию <ArrowRight size={19} />
            </a>
            <a
              href="#request-demo"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "transparent", color: "#fff", padding: "14px 30px",
                border: "1.5px solid rgba(255,255,255,0.7)",
                borderRadius: 12, fontWeight: 700, fontSize: 17, textDecoration: "none",
              }}
            >
              Получить демо-доступ
            </a>
          </div>
        </section>
      </div>

      {/* ── ФУТЕР ── */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "40px 20px 56px",
        }}
      >
        <div
          style={{
            maxWidth: 1080, margin: "0 auto",
            display: "flex", justifyContent: "space-between", gap: 32, flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 320 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 32, height: 32, borderRadius: 9, background: BRAND,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <PhoneCall size={17} color="#fff" strokeWidth={2.4} />
              </div>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Call-Agent</span>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--muted-foreground)", margin: 0 }}>
              AI-контроль качества коммуникаций отдела продаж. Каждый звонок, чат и встреча — под контролем.
            </p>
          </div>

          <div style={{ display: "flex", gap: 48, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 12 }}>
                Продукт
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
                <a href="#request-demo" style={footerLink}>Демо</a>
                <Link href="/pricing" style={footerLink}>Тарифы</Link>
                <Link href="/login" style={footerLink}>Войти</Link>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 12 }}>
                Документы
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
                {/* Политика обработки ПД обязательно размещается в подвале сайта (152-ФЗ) */}
                <Link href="/privacy" style={footerLink}>Политика обработки персональных данных</Link>
                <Link href="/cookie-policy" style={footerLink}>Политика обработки файлов cookie</Link>
                <Link href="/consent" style={footerLink}>Согласие на обработку ПДн</Link>
                <Link href="/consent-metrika" style={footerLink}>Согласие на обработку через Яндекс.Метрику</Link>
                <Link href="/consent-marketing" style={footerLink}>Согласие на рассылку</Link>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            maxWidth: 1080, margin: "32px auto 0", paddingTop: 24,
            borderTop: "1px solid var(--border)",
            fontSize: 13, color: "var(--muted-foreground)",
          }}
        >
          © {new Date().getFullYear()} Call-Agent. Все права защищены.
        </div>
      </footer>

      {/* Cookie-баннер (152-ФЗ / аналитика) */}
      <CookieBanner />

      {/* Адаптив: на узком экране hero в одну колонку, форма в одну колонку,
          таблица сравнения превращается в карточки */}
      <style>{`
        @media (max-width: 820px) {
          .about-hero { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 560px) {
          .form-grid { grid-template-columns: 1fr !important; }
          .nav-hide-mobile { display: none !important; }
          .compare-table .compare-head { display: none !important; }
          .compare-table .compare-row {
            display: block !important;
            border-bottom: 1px solid var(--border) !important;
          }
          .compare-table .compare-row > div {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            gap: 12px !important;
            background: transparent !important;
            padding: 12px 16px !important;
          }
          .compare-table .compare-row > div::before {
            content: attr(data-label);
            font-size: 12px;
            font-weight: 700;
            color: var(--muted-foreground);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            flex-shrink: 0;
          }
          .compare-table .compare-row > div[data-label="Параметр"] {
            background: color-mix(in oklch, var(--primary) 7%, var(--card)) !important;
            font-weight: 700 !important;
          }
          .compare-table .compare-row > div[data-label="Параметр"]::before { content: ""; }
        }
      `}</style>
    </main>
  );
}

/* ── Заголовок секции (kicker + title + subtitle) ── */
function SectionHeading({
  kicker, title, subtitle,
}: {
  kicker: string;
  title: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div style={{ textAlign: "center", maxWidth: 700, margin: "0 auto" }}>
      <div
        style={{
          display: "inline-block",
          fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: BRAND, marginBottom: 12,
        }}
      >
        {kicker}
      </div>
      <h2 style={{ fontSize: "clamp(24px, 3vw, 34px)", fontWeight: 800, margin: "0 0 14px", lineHeight: 1.2 }}>
        {title}
      </h2>
      <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--muted-foreground)", margin: 0 }}>
        {subtitle}
      </p>
    </div>
  );
}

const footerLink: React.CSSProperties = {
  color: "var(--muted-foreground)",
  textDecoration: "none",
};
