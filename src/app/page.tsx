/**
 * Публичный продающий лендинг Колл Агент — полный одностраничник.
 * Доступен без авторизации по корню /call-agent (раньше жил на /about —
 * маршрут удалён, теперь просто редиректит сюда же). В стиле платформы
 * (CSS-переменные темы + бренд #7c70e0, lucide-иконки, адаптив).
 *
 * Секции: Hero → Проблема → (абзац-решение) → Как работает → Что умеет →
 * Что получает бизнес → Для кого → Почему Колл Агент (таблица) → Тарифы →
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
  ChevronRight, HelpCircle, FileCheck2, BellRing, Check, X, Building2, Plus, Rocket, Compass, Moon, Zap,
} from "lucide-react";
import ContactForm from "./ContactForm";
import CookieBanner from "./_components/CookieBanner";

export const metadata: Metadata = {
  title: "Колл Агент — AI-контроль каждого звонка отдела продаж",
  description:
    "Ваш отдел продаж делает сотни звонков в неделю — все прослушать невозможно. Колл Агент слушает за вас: AI разбирает каждый звонок и встречу по вашему скрипту, ловит расхождения с CRM и показывает руководителю всю картину продаж на одном дашборде. Внедрение за 1 день, 3 дня бесплатно.",
  openGraph: {
    title: "Сотни звонков в неделю — все прослушать невозможно",
    description:
      "Колл Агент слушает за вас: AI-разбор каждого звонка по вашему скрипту, сверка с CRM, дашборд руководителя и автоотчёты. Контроль продаж на фактах.",
    type: "website",
    siteName: "Колл Агент",
  },
};

const BRAND = "#7c70e0";

export default function RootLandingPage() {
  // 40 «звонков» за неделю. Подсвеченные разнесены по сетке (без соседства и линий):
  // фиолетовые (5) — прослушал РОП; оранжевые/красные — проблемные звонки,
  // которые никто не прослушал.
  const CALLS = Array.from({ length: 40 }, (_, i) => i);
  const HEARD = new Set([1, 11, 16, 30, 36]);
  const WARN = "#f2960b";
  const CRIT = "#e5484d";
  // Проблемные звонки: level "warn" (оранжевый) / "crit" (красный) + подсказка.
  const PROBLEMS: Record<number, { level: "warn" | "crit"; label: string }> = {
    6: { level: "warn", label: "Не отработаны возражения" },
    15: { level: "crit", label: "Сделка потеряна — клиент ушёл к конкуренту" },
    21: { level: "warn", label: "Не назвали цену и условия" },
    26: { level: "crit", label: "Слил горячего клиента — не перезвонил" },
    33: { level: "warn", label: "Не назначили следующий шаг" },
  };

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
              <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1 }}>Колл Агент</div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>
                AI-контроль качества продаж
              </div>
            </div>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 14 }}>
            <a href="#features" style={{ color: "var(--muted-foreground)", textDecoration: "none" }} className="nav-hide-mobile">
              Возможности
            </a>
            <Link href="/pricing" style={{ color: "var(--muted-foreground)", textDecoration: "none" }} className="nav-hide-mobile">
              Тарифы
            </Link>
            <a
              href="#request-demo"
              className="nav-hide-mobile"
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

        {/* ── HERO: блок «боль» ──
            Именованные grid-area вместо вложенной левой колонки: на десктопе
            визуализация занимает всю правую колонку (areas повторяют "visual"
            в каждой строке), на мобильном (@media в конце файла) area
            переопределяется в один столбец с visual МЕЖДУ заголовком и лидом. */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.15fr) minmax(0,0.85fr)",
            gridTemplateAreas: `"badge visual" "headline visual" "lead visual" "ctas visual" "trust visual"`,
            gap: 48,
            alignItems: "center",
            padding: "48px 0 64px",
          }}
          className="about-hero"
        >
          <div
            className="hero-area-badge"
            style={{
              gridArea: "badge",
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "color-mix(in oklch, var(--primary) 14%, var(--card))",
              color: BRAND, borderRadius: 999, padding: "6px 14px",
              fontSize: 13, fontWeight: 600, width: "fit-content",
            }}
          >
            <Sparkles size={14} /> Контроль продаж на фактах и цифрах
          </div>

          <h1
            className="hero-area-headline"
            style={{
              gridArea: "headline",
              fontSize: "clamp(24px, 3.1vw, 37px)", lineHeight: 1.14, fontWeight: 800,
              margin: 0, letterSpacing: "-0.015em",
            }}
          >
            Ваш отдел продаж делает сотни, а то и тысячи звонков в неделю.
            Все прослушать —{" "}
            <span style={{ color: BRAND }}>невозможно.</span>
          </h1>

          <div className="hero-area-lead" style={{ gridArea: "lead" }}>
            <p
              style={{
                fontSize: "clamp(16px, 1.7vw, 19px)", lineHeight: 1.6,
                color: "var(--muted-foreground)", margin: "0 0 14px", maxWidth: 560,
              }}
            >
              Колл Агент слушает за вас. AI разбирает каждый звонок и встречу, показывает,
              кто как продаёт, где теряются сделки и что улучшить — <b style={{ color: "var(--foreground)" }}>без ручной прослушки</b>.
            </p>
            <p
              style={{
                fontSize: "clamp(16px, 1.7vw, 19px)", lineHeight: 1.6,
                color: "var(--muted-foreground)", margin: 0, maxWidth: 560,
              }}
            >
              Весь отдел на одном дашборде. Всё под контролем.
            </p>
          </div>

          <div className="hero-area-ctas" style={{ gridArea: "ctas", display: "flex", gap: 12, flexWrap: "wrap" }}>
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
              className="hero-secondary-cta"
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
            className="hero-area-trust"
            style={{
              gridArea: "trust",
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
              fontSize: 13.5, color: "var(--muted-foreground)",
            }}
          >
            <span>Bitrix24, amoCRM и любая другая CRM</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Внедрение за 1 день</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>3 дня бесплатно</span>
          </div>

          {/* Визуализация «слышно только 5 из 40» */}
          <div
            className="hero-area-visual"
            style={{
              gridArea: "visual",
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
                const problem = PROBLEMS[i];
                const accent = problem ? (problem.level === "crit" ? CRIT : WARN) : null;
                const title = heard
                  ? "Прослушан руководителем"
                  : problem
                    ? `Никто не прослушал · ${problem.label}`
                    : "Никто не прослушал";
                return (
                  <div
                    key={i}
                    title={title}
                    style={{
                      aspectRatio: "1", borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: heard
                        ? BRAND
                        : accent
                          ? `color-mix(in oklch, ${accent} 16%, transparent)`
                          : "color-mix(in oklch, var(--muted-foreground) 12%, transparent)",
                      border: heard
                        ? "none"
                        : accent
                          ? `1px solid ${accent}`
                          : "1px solid var(--border)",
                    }}
                  >
                    <PhoneCall
                      size={13}
                      color={heard ? "#fff" : accent ? accent : "var(--muted-foreground)"}
                      strokeWidth={2}
                      style={{ opacity: heard || accent ? 1 : 0.45 }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              <span style={{ color: BRAND, fontWeight: 700 }}>■</span> — прослушал РОП: <b style={{ color: "var(--foreground)" }}>5 из 40</b>.
              <br />
              <span style={{ color: WARN, fontWeight: 700 }}>■</span>{" "}
              <span style={{ color: CRIT, fontWeight: 700 }}>■</span> — звонки с проблемами, которые <b style={{ color: "var(--foreground)" }}>не прослушаны</b>: потерянные сделки, не отработанные возражения.
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
                d: "РОП физически не успевает прослушать сотни звонков — а решения приходится принимать по тем немногим, что прослушал.",
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
                className="mobile-center-card"
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 14, padding: 24, position: "relative",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: BRAND, letterSpacing: "0.06em", marginBottom: 14 }}>
                  ШАГ {n}
                </div>
                <div
                  className="card-icon-box"
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
              { Icon: ClipboardCheck, t: "Разбор каждого разговора", d: "Оценка менеджера 0–10, чек-лист по пунктам, тональность, возражения, следующий шаг — через минуту после звонка." },
              { Icon: BrainCircuit, t: "Учит после каждого звонка", d: "Не просто оценка — доброжелательная подсказка менеджеру: что сказать по-другому в следующий раз, чтобы довести разговор до сделки." },
              { Icon: LayoutDashboard, t: "Дашборд руководителя", d: "Метрики по каждому менеджеру: кто держит планку, кто проседает, какой пункт скрипта команда проваливает чаще всего." },
              { Icon: Scale, t: "Сверка с CRM", d: "Находит расхождения между разговором и карточкой: в CRM 150 000, а в разговоре согласовали 250 000 — раньше эти деньги терялись, теперь расхождение не просто видно, а одной кнопкой дописывается в карточку." },
              { Icon: FileCheck2, t: "Скрипт и чек-лист под вас", d: "Загружаете свой скрипт и стандарт качества — система оценивает именно по нему. Нет жёсткого скрипта? Можно оценивать по структуре разговора, без привязки к точным формулировкам." },
              { Icon: BellRing, t: "Автоматические отчёты", d: "Сводка по команде каждое утро прямо в чат, по расписанию. Не нужно запрашивать и ждать. А менеджеры больше не тратят время на ручные отчёты." },
              { Icon: Clock, t: "Не забудет перезвонить", d: "Клиент называет дату и время следующего созвона — система сама ставит менеджеру напоминание, без записи в блокнот." },
              { Icon: Trophy, t: "Мотивация команды", d: "Лидерборд, рейтинг менеджеров, личный кабинет с зонами роста." },
              { Icon: Tv, t: "ТВ-табло", d: "Показатели отдела на экране в офисе, рейтинг менеджеров крупно, в реальном времени." },
              { Icon: Compass, t: "Кабинет РОПа", d: "Один экран для руководителя: звонки, которые нужно послушать в первую очередь, у кого из команды просела динамика, свежие заметки по менеджерам." },
              { Icon: ShieldCheck, t: "100% по 152-ФЗ", d: "Телефон, email, ФИО и адреса клиентов маскируются перед отправкой в AI — реальные персональные данные в обработку не попадают." },
              { Icon: MessagesSquare, t: "Больше каналов", d: "Чаты, почта и переписка в CRM — система будет так же разбирать и оценивать их, не только звонки и встречи.", soon: true },
            ].map(({ Icon, t, d, soon }) => (
              <div
                key={t}
                className="mobile-center-card"
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
                  className="card-icon-box"
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
            subtitle="Деньги, время и единый стандарт продаж — на данных из каждого разговора."
          />
          <div
            style={{
              display: "flex", flexWrap: "wrap", justifyContent: "center",
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
                  flex: "1 1 300px", maxWidth: 340,
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
                тем больше теряется без контроля — и тем нужнее Колл Агент. Подключаемся
                к любой CRM или напрямую к телефонии.
              </p>
            </div>
          </div>
        </section>

        {/* ── ПОЧЕМУ CALL-AGENT (сравнение) ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Сравнение"
            title={<>Почему <span style={{ color: BRAND }}>Колл Агент</span></>}
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
                <PhoneCall size={16} strokeWidth={2.4} /> Колл Агент
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
                  data-label="Колл Агент"
                >
                  <Check size={15} color={BRAND} strokeWidth={3} style={{ flexShrink: 0 }} />
                  {row.ca}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── ТАРИФЫ ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Тарифы"
            title={<>Прозрачно, <span style={{ color: BRAND }}>от 9 800 ₽/мес</span></>}
            subtitle="Без скрытых платежей и платы за пользователей. Платите за результат."
          />
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 16, marginTop: 40, alignItems: "stretch",
            }}
          >
            {[
              { name: "Старт", price: "9 800", popular: false,
                features: ["4 000 минут разговоров в месяц", "AI-транскрипция с разделением менеджер/клиент", "Оценка по чек-листу качества (QC)", "Дашборд по менеджерам", "Режим обработки: Аналитика"] },
              { name: "Базовый", price: "19 800", popular: true,
                features: ["10 000 минут разговоров в месяц", "Всё из тарифа Старт", "Сравнение разговора с CRM-карточкой", "Инбокс расхождений", "Публичный дашборд", "Режим обработки: Аналитика"] },
              { name: "Про", price: "39 800", popular: false,
                features: ["20 000 минут разговоров в месяц", "Всё из тарифа Базовый", "Режим Live: разбор и подсказка через пару минут после звонка", "Кабинет менеджера", "Геймификация (лидерборд)", "Напоминания и follow-up"] },
              { name: "Бизнес", price: "от 79 800", popular: false,
                features: ["50 000 минут разговоров в месяц", "Всё из тарифа Про (включая Live)", "Неограниченно менеджеров", "Авто-запись в CRM", "API-доступ", "Приоритетная поддержка и выделенный онбординг"] },
            ].map((p) => (
              <div
                key={p.name}
                style={{
                  display: "flex", flexDirection: "column",
                  background: p.popular ? "color-mix(in oklch, var(--primary) 6%, var(--card))" : "var(--card)",
                  border: p.popular ? `1.5px solid ${BRAND}` : "1px solid var(--border)",
                  borderRadius: 16, padding: 24, position: "relative",
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
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 18 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: BRAND, letterSpacing: "-0.02em" }}>
                    {p.price}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--muted-foreground)" }}>₽/мес</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
                  {p.features.map((f) => (
                    <div key={f} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.4 }}>
                      <Check size={15} color={BRAND} strokeWidth={3} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={f.startsWith("Режим Live") ? { fontWeight: 700 } : undefined}>{f}</span>
                    </div>
                  ))}
                </div>
                <a
                  href="#request-demo"
                  style={{
                    marginTop: "auto", textAlign: "center", textDecoration: "none",
                    background: p.popular ? BRAND : "transparent",
                    color: p.popular ? "#fff" : BRAND,
                    border: p.popular ? "none" : `1.5px solid ${BRAND}`,
                    padding: "11px 16px", borderRadius: 11, fontWeight: 700, fontSize: 14,
                  }}
                >
                  Попробовать
                </a>
              </div>
            ))}
          </div>

          {/* ── РЕЖИМЫ ОБРАБОТКИ ── */}
          <div style={{ marginTop: 48 }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND, marginBottom: 8 }}>
                Режимы обработки
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>
                Аналитика или Live — выбирайте под задачу
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "color-mix(in oklch, var(--primary) 10%, var(--card))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Moon size={17} color={BRAND} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Режим «Аналитика»</div>
                </div>
                <p style={{ fontSize: 13.5, color: "var(--muted-foreground)", lineHeight: 1.55, marginBottom: 12 }}>
                  Звонки обрабатываются пачками в течение ночи. К 9:00 утра у руководителя готов полный разбор вчерашнего дня: расшифровки, оценки по чек-листу, расхождения с CRM и обновлённый дашборд. Оптимально для контроля качества и регулярной аналитики отдела продаж.
                </p>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND }}>Доступен на всех тарифах</div>
              </div>
              <div style={{ background: "color-mix(in oklch, var(--primary) 5%, var(--card))", border: `1.5px solid ${BRAND}`, borderRadius: 16, padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: BRAND, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Zap size={17} color="#fff" />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Режим «Live»</div>
                </div>
                <p style={{ fontSize: 13.5, color: "var(--muted-foreground)", lineHeight: 1.55, marginBottom: 12 }}>
                  Разбор звонка и персональная подсказка менеджеру приходят через 2–3 минуты после завершения разговора. Менеджер видит, что сделал хорошо и что исправить в следующем звонке, а руководитель может отреагировать на горящую сделку в тот же час.
                </p>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND }}>Доступен на тарифах Про и Бизнес</div>
              </div>
            </div>
          </div>

          {/* ── Сноска про перерасход ── */}
          <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.6, marginTop: 28, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
            Перерасход: 3&nbsp;₽/мин в режиме Аналитика, 5&nbsp;₽/мин в режиме Live. Звонки короче 30 секунд не тарифицируются — вы платите только за состоявшиеся разговоры. Ориентир «≈ звонков» рассчитан из средней длительности разговора 4 минуты.
          </p>

          {/* Тестовый тариф — кнопкой снизу */}
          <div
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
              gap: 20, marginTop: 24,
              background: "color-mix(in oklch, var(--primary) 8%, var(--card))",
              border: `1px dashed ${BRAND}`, borderRadius: 16, padding: "22px 26px",
            }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center", flex: "1 1 340px" }}>
              <div
                style={{
                  width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                  background: BRAND, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Rocket size={22} color="#fff" strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 3 }}>
                  Хотите сначала просто попробовать?
                </div>
                <div style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Тестовый доступ — <b style={{ color: "var(--foreground)" }}>5 рабочих дней</b> на ваших звонках за <b style={{ color: "var(--foreground)" }}>10 000&nbsp;₽</b>.
                </div>
              </div>
            </div>
            <a
              href="#request-demo"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
                background: BRAND, color: "#fff", padding: "13px 26px",
                borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none",
              }}
            >
              Запросить тестовый доступ <ArrowRight size={18} />
            </a>
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
                a: "Записи и расшифровки хранятся на серверах в РФ. Перед AI-анализом телефоны, email, имена и адреса автоматически маскируются — в чистом виде разговор на анализ не уходит. Для повышенных требований разворачиваем систему прямо на сервере вашей компании. Вопросы согласия на запись закроем при настройке.",
              },
            ].map((item) => (
              <details
                key={item.q}
                className="faq-item"
                style={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 12, padding: "16px 20px",
                }}
              >
                <summary
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    fontSize: 15.5, fontWeight: 600, cursor: "pointer", listStyle: "none",
                  }}
                >
                  <HelpCircle size={18} color={BRAND} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{item.q}</span>
                  <span
                    className="faq-plus"
                    style={{
                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, borderRadius: 8,
                      background: "color-mix(in oklch, var(--primary) 12%, transparent)",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    <Plus size={16} color={BRAND} strokeWidth={2.6} />
                  </span>
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
          <div style={{ maxWidth: 760, margin: "36px auto 0" }}>
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
            Подключение — за один день. Колл Агент — контроль продаж на фактах.
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
              <span style={{ fontWeight: 800, fontSize: 16 }}>Колл Агент</span>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--muted-foreground)", margin: 0 }}>
              AI-контроль качества коммуникаций отдела продаж. Каждый звонок, чат и встреча — под контролем.
            </p>
          </div>

          <div style={{ display: "flex", gap: 72, flexWrap: "wrap" }}>
            <div style={{ minWidth: 120 }}>
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
                <Link href="/oferta" style={footerLink}>Публичная оферта</Link>
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
            fontSize: 13, color: "var(--muted-foreground)", textAlign: "center",
          }}
        >
          © {new Date().getFullYear()} Колл Агент. Все права защищены.
        </div>
      </footer>

      {/* Cookie-баннер (152-ФЗ / аналитика) */}
      <CookieBanner />

      {/* Адаптив: на узком экране hero в одну колонку, форма в одну колонку,
          таблица сравнения превращается в карточки */}
      <style>{`
        .faq-item { transition: border-color 0.2s ease; }
        .faq-item:hover { border-color: color-mix(in oklch, ${BRAND} 45%, var(--border)); }
        .faq-item[open] { border-color: ${BRAND}; }
        .faq-item[open] .faq-plus { transform: rotate(45deg); background: color-mix(in oklch, ${BRAND} 20%, transparent); }
        .faq-item summary:hover .faq-plus { background: color-mix(in oklch, ${BRAND} 20%, transparent); }
        .faq-item summary::-webkit-details-marker { display: none; }
        @media (max-width: 820px) {
          .about-hero {
            grid-template-columns: 1fr !important;
            grid-template-areas: "badge" "headline" "visual" "lead" "ctas" "trust" !important;
            gap: 24px !important;
          }
        }
        @media (max-width: 560px) {
          .form-grid { grid-template-columns: 1fr !important; }
          .nav-hide-mobile { display: none !important; }
          .hero-secondary-cta { display: none !important; }
          .hero-area-ctas { justify-content: center !important; }
          .mobile-center-card { text-align: center !important; }
          .card-icon-box { margin-left: auto !important; margin-right: auto !important; }
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
