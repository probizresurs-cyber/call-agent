/**
 * Публичный продающий лендинг Call-Agent — полный одностраничник.
 * Доступен без авторизации по /call-agent/about. В стиле платформы
 * (CSS-переменные темы + бренд #7c70e0, lucide-иконки, адаптив).
 *
 * Секции: Hero → Проблема → Как работает → Возможности → Что получает бизнес →
 * Тарифы (кратко) → FAQ → Форма заявки (ОТКЛЮЧЕНА, см. ContactForm) → Футер.
 * Cookie-баннер подключён внизу.
 *
 * Server component; интерактив вынесен в ContactForm.tsx и CookieBanner.tsx.
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  PhoneCall, ArrowRight, Sparkles, ClipboardCheck, Scale, BarChart3,
  Download, FileText, BrainCircuit, LayoutDashboard, MessagesSquare,
  UserRound, Bot, Tv, Trophy, TrendingUp, Clock, ShieldCheck, Database,
  ChevronRight, HelpCircle, Mail, Phone,
} from "lucide-react";
import ContactForm from "./ContactForm";
import CookieBanner from "../_components/CookieBanner";

export const metadata: Metadata = {
  title: "Call-Agent — AI-контроль каждого звонка отдела продаж",
  description:
    "Сотни звонков в неделю, а руководитель слышит три. Call-Agent разбирает каждый звонок, чат, письмо и встречу нейросетью по вашему скрипту, ловит расхождения с CRM и показывает РОПу всю картину продаж. Тарифы от 3 500 ₽/мес. Демо открыто.",
  openGraph: {
    title: "Сотни звонков. А слышит руководитель — три.",
    description:
      "Call-Agent слушает за вас: AI-разбор каждого звонка по вашему скрипту, сверка с CRM, дашборд РОПа и автоотчёты. Контроль продаж на фактах.",
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
                Открыть демо <ArrowRight size={18} />
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

        {/* ── ПРОБЛЕМА ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Проблема"
            title={<>Контроль продаж держится на <span style={{ color: BRAND }}>доверии и удаче</span></>}
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
                t: "РОП физически не успевает слушать",
                d: "Чтобы прослушать неделю звонков вручную, нужны дни. В итоге выборка — пара случайных разговоров, а вывод о работе менеджера — на глазок.",
              },
              {
                t: "Сделки утекают незаметно",
                d: "Не отработал возражение «дорого», пообещал и не перезвонил, слил горячего клиента сухим ответом. Каждый такой эпизод — потерянные деньги, о которых никто не узнал.",
              },
              {
                t: "CRM не сходится с реальностью",
                d: "В разговоре клиент согласовал 250 000, а в карточке стоит 150 000. Сменился контакт, срок, этап — в CRM пусто. Прогноз и отчёты строятся на кривых данных.",
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
              { Icon: Download, n: "01", t: "Забор данных", d: "Система сама тянет из Bitrix24 звонки, чаты, письма и встречи. Без участия менеджеров." },
              { Icon: FileText, n: "02", t: "Расшифровка", d: "Аудио превращается в текст (Whisper) с разделением реплик «менеджер / клиент»." },
              { Icon: BrainCircuit, n: "03", t: "AI-анализ", d: "Нейросеть оценивает разговор по вашему скрипту и чек-листу: оценка, возражения, следующий шаг." },
              { Icon: BarChart3, n: "04", t: "Результат", d: "Всё в дашборде РОПа. Итог — комментарием в карточку Bitrix, сводки — в мессенджер." },
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

        {/* ── ВОЗМОЖНОСТИ ── */}
        <section id="features" style={{ padding: "8px 0 64px", scrollMarginTop: 24 }}>
          <SectionHeading
            kicker="Возможности"
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
              { Icon: ClipboardCheck, t: "Разбор каждого звонка", d: "Оценка 0–10, выполнение чек-листа по пунктам, тональность, возражения, темы и следующий шаг — через минуту после разговора." },
              { Icon: LayoutDashboard, t: "Дашборд РОПа", d: "KPI отдела, таблица по каждому менеджеру, динамика за 14 дней, топ возражений и слабые места в скрипте." },
              { Icon: Scale, t: "Сверка с CRM", d: "Система ловит расхождения между разговором и карточкой сделки Bitrix: сумма, контакт, срок, этап. Деньги перестают теряться." },
              { Icon: MessagesSquare, t: "Омниканальность", d: "Звонки, чаты (WhatsApp/Telegram/ВК), письма и встречи — всё в одном анализе, по единому стандарту." },
              { Icon: UserRound, t: "Профиль клиента 360", d: "Вся история касаний по клиенту в одной ленте, динамика тональности и «оборванные нити» — где сделка жива, а контакта давно нет." },
              { Icon: Bot, t: "Автоотчёты в Bitrix", d: "Краткий итог анализа пишется комментарием в карточку сделки. Сводки уходят в личку РОПа или в групповой чат по расписанию." },
              { Icon: Tv, t: "ТВ-табло", d: "Публичная read-only ссылка на дашборд для собственника или для экрана в офисе — без логина." },
              { Icon: Trophy, t: "Лидерборд", d: "Рейтинг менеджеров, ачивки и серии — мотивационный слой и кабинет самообучения для каждого." },
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
            title={<>Что это <span style={{ color: BRAND }}>даёт бизнесу</span></>}
            subtitle="Не «ещё один дашборд», а деньги, время и единый стандарт продаж."
          />
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 18, marginTop: 36,
            }}
          >
            {[
              { Icon: TrendingUp, t: "Рост выручки", d: "Возражения отрабатываются, follow-up не теряется, слабые места скрипта подтягиваются — конверсия растёт по всей команде." },
              { Icon: Clock, t: "Экономия часов РОПа", d: "Не нужно вручную слушать звонки. РОП получает готовую картину и точечно работает там, где проседает." },
              { Icon: ShieldCheck, t: "Единый стандарт", d: "Все менеджеры оцениваются по одному скрипту и чек-листу. Объективно, без вкусовщины и любимчиков." },
              { Icon: Database, t: "Чистая CRM", d: "Расхождения подсвечиваются и исправляются. Прогноз и отчёты строятся на реальных данных, а не на том, что менеджер успел внести." },
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
            title={<>Частые <span style={{ color: BRAND }}>сомнения</span></>}
            subtitle="Снимаем главные возражения перед стартом."
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 36, maxWidth: 820, marginLeft: "auto", marginRight: "auto" }}>
            {[
              {
                q: "У нас маленький отдел — это не для нас?",
                a: "Наоборот. Когда менеджеров мало, цена каждой потерянной сделки выше, а РОП часто совмещает роли и слушать звонки некогда. Тариф Старт рассчитан как раз на небольшую команду.",
              },
              {
                q: "Это сложно внедрять?",
                a: "Нет. Подключение — через входящий вебхук Bitrix24, занимает около 15 минут. Менеджеры ничего не настраивают: анализ идёт фоном, они продолжают работать как обычно.",
              },
              {
                q: "У нас своя CRM, не Bitrix24",
                a: "Базово платформа работает поверх Bitrix24, поддержка amoCRM и других — на подключении. Плюс можно загружать аудио и текст вручную (Zoom, диктофон, любой файл) — без CRM вообще.",
              },
              {
                q: "Законно ли обрабатывать звонки и персональные данные?",
                a: "Да, при соблюдении 152-ФЗ: уведомлении сотрудников и клиентов, наличии согласий и политики обработки ПД. Данные изолированы по компании (тенанту), доступ разграничен по ролям.",
              },
              {
                q: "Менеджеры будут против контроля",
                a: "Контроль становится прозрачным и единым для всех — это снимает вкусовщину. А кабинет менеджера с персональными подсказками ИИ и лидерборд превращают оценку в инструмент роста, а не в наказание.",
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

        {/* ── ФОРМА ЗАЯВКИ ── */}
        <section style={{ padding: "8px 0 64px" }}>
          <SectionHeading
            kicker="Связаться"
            title={<>Оставить <span style={{ color: BRAND }}>заявку</span></>}
            subtitle="Расскажите про ваш отдел продаж — покажем, как Call-Agent сработает на ваших данных."
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
                <Link href="/demo" style={footerLink}>Демо</Link>
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
                <Link href="/offer" style={footerLink}>Публичная оферта</Link>
                <Link href="/consent" style={footerLink}>Согласие на обработку ПД</Link>
                <Link href="/consent-marketing" style={footerLink}>Согласие на рассылку</Link>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 12 }}>
                Контакты
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
                {/* TODO: заменить плейсхолдеры на реальные контакты заказчика */}
                <a href="mailto:hello@example.ru" style={{ ...footerLink, display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Mail size={14} /> hello@example.ru
                </a>
                <a href="tel:+70000000000" style={{ ...footerLink, display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Phone size={14} /> +7 (000) 000-00-00
                </a>
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

      {/* Адаптив: на узком экране hero в одну колонку, форма в одну колонку */}
      <style>{`
        @media (max-width: 820px) {
          .about-hero { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 560px) {
          .form-grid { grid-template-columns: 1fr !important; }
          .nav-hide-mobile { display: none !important; }
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
