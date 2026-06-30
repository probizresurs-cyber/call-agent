"use client";

/**
 * TvBoard — полноэкранное ТВ-табло отдела продаж для показа на большом экране
 * в офисе (16:9, 1920×1080), просмотр издалека.
 *
 * Рассчитан на встраивание в публичный read-only дашборд (/public/dashboard/[token]?tv=1).
 * Данные приходят пропом `data` (уже посчитаны на сервере loadDashboardData) —
 * компонент НИЧЕГО не грузит и ничего не меняет (read-only).
 *
 * Тёмная тема самодостаточна (инлайн-стили, свои цвета) — не зависит от темы
 * платформы и не использует сайдбар/шапку платформы. Занимает 100vw/100vh.
 *
 * Карусель:
 *   - слайд 0 — ОБЗОР (общие KPI + компактный рейтинг всех менеджеров);
 *   - слайды 1..N — каждый менеджер КРУПНО на весь экран (по убыванию оценки).
 * Автолистание ~10 сек, зациклено, плавный fade. Внизу — точки-индикатор.
 *
 * Переключатель периода (Сегодня / Неделя / Месяц) — это `<a href>` на тот же URL
 * с другим `?period=` (смена периода = перезагрузка страницы сервером). Без датпикера.
 */
import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { DashboardData, ManagerStatsRow } from "@/lib/dashboard-data";

// ── Самодостаточная тёмная палитра табло (не зависит от темы платформы) ──
const C = {
  bg: "#0c0f1a",            // фон табло
  panel: "#161a2b",         // плитки/карточки
  panelAlt: "#1d2238",      // вторичная панель / строки
  border: "#272d44",
  text: "#eef1f8",          // основной текст
  textDim: "#9aa2bd",       // приглушённый текст
  accent: "#7c70e0",        // акцент (фиолетовый бренд)
  good: "#22c55e",          // зелёный (оценка ≥ 7)
  warn: "#eab308",          // жёлтый (5..7)
  bad: "#ef4444",           // красный (< 5)
  neutral: "#8b93ad",       // нейтрально
};

const SLIDE_MS = 10000; // автолистание ~10 сек

// Разбивка рейтинга по обзорным слайдам — чтобы каждый влезал ровно в один экран
// (на ТВ нельзя скроллить). Первый обзорный слайд несёт KPI-плитки → строк меньше;
// последующие обзорные слайды только рейтинг → строк больше.
const RATING_FIRST = 6;
const RATING_CONT = 9;

/** Описание одного слайда презентации. */
type TvSlideDesc =
  | {
      kind: "overview";
      rating: ManagerStatsRow[];
      startRank: number; // 0-based смещение для нумерации рейтинга
      showKpi: boolean; // KPI-плитки только на первом обзорном слайде
      part: number; // номер обзорного слайда (1..parts) для подписи
      parts: number; // всего обзорных слайдов
    }
  | { kind: "manager"; m: ManagerStatsRow; rank: number };

/**
 * Собирает плоский список слайдов: обзорные (рейтинг порциями) + по слайду на
 * каждого менеджера с оценкой. Гарантирует, что контент каждого слайда влезает
 * в экран (рейтинг бьётся на части RATING_FIRST/RATING_CONT).
 */
function buildSlides(ranked: ManagerStatsRow[], scored: ManagerStatsRow[]): TvSlideDesc[] {
  const slides: TvSlideDesc[] = [];

  // Обзорные слайды: рейтинг разбит на порции
  const chunks: ManagerStatsRow[][] = [];
  if (ranked.length === 0) {
    chunks.push([]);
  } else {
    chunks.push(ranked.slice(0, RATING_FIRST));
    for (let i = RATING_FIRST; i < ranked.length; i += RATING_CONT) {
      chunks.push(ranked.slice(i, i + RATING_CONT));
    }
  }
  let start = 0;
  chunks.forEach((c, i) => {
    slides.push({
      kind: "overview",
      rating: c,
      startRank: start,
      showKpi: i === 0,
      part: i + 1,
      parts: chunks.length,
    });
    start += c.length;
  });

  // Персональные слайды — каждый менеджер с оценкой, по убыванию оценки
  scored.forEach((m, i) => slides.push({ kind: "manager", m, rank: i + 1 }));

  return slides;
}

interface Props {
  data: DashboardData;
  /** Текущий период (для подсветки кнопки) */
  period: "today" | "week" | "month";
  /**
   * Базовый путь, на который ведут кнопки переключения периода (ссылки вида
   * `${basePath}?tv=1&period=...`). Работает в обоих режимах:
   *   - публичный: `/call-agent/public/dashboard/{token}`
   *   - приватный (за логином): `/call-agent/dashboard`
   */
  basePath: string;
  /**
   * Куда вести кнопку выхода (крестик в углу). Если задан — показываем крестик.
   * В приватном режиме = `/call-agent/dashboard` (вернуться к обычному дашборду).
   * В публичном режиме обычно не задаётся (крестик скрыт).
   */
  exitHref?: string;
}

export function TvBoard({ data, period, basePath, exitHref }: Props) {
  // Менеджеры для пер-менеджерских слайдов: только с оценкой, по убыванию оценки.
  // Без оценки (avg_score == null) — пропускаем в персональных слайдах, но в обзоре
  // показываем всех (отсортированных по оценке, безоценочные — в конце).
  const ranked = useMemo(() => rankManagers(data.allManagers), [data.allManagers]);
  const scored = useMemo(() => ranked.filter((m) => m.avg_score != null), [ranked]);

  // Плоский список слайдов презентации: обзорные (рейтинг порциями) + по менеджеру.
  // Каждый слайд гарантированно влезает в один экран — на ТВ нет скролла.
  const slides = useMemo(() => buildSlides(ranked, scored), [ranked, scored]);
  const slideCount = slides.length;

  const [slide, setSlide] = useState(0);

  // Перейти на dir слайдов вперёд/назад (с зацикливанием).
  const go = (dir: number) =>
    setSlide((s) => (slideCount ? (s + dir + slideCount) % slideCount : 0));

  // Автолистание: setTimeout перезапускается при КАЖДОЙ смене слайда (в т.ч. ручной),
  // поэтому после ручного переключения снова даётся полный интервал.
  useEffect(() => {
    if (slideCount <= 1) return; // нечего листать
    const t = setTimeout(() => setSlide((s) => (s + 1) % slideCount), SLIDE_MS);
    return () => clearTimeout(t);
  }, [slide, slideCount]);

  // Если число слайдов уменьшилось (новые данные) — не выходим за границы
  useEffect(() => {
    if (slide >= slideCount && slideCount > 0) setSlide(0);
  }, [slide, slideCount]);

  // Навигация с клавиатуры / пульта ТВ: стрелки, Space, PageUp/PageDown.
  // (На ТВ нельзя скроллить — листаем слайды как презентацию.)
  useEffect(() => {
    if (slideCount <= 1) return;
    function onKey(e: KeyboardEvent) {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Spacebar"].includes(e.key)) {
        e.preventDefault();
        setSlide((s) => (s + 1) % slideCount);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        setSlide((s) => (s - 1 + slideCount) % slideCount);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slideCount]);

  const hasManagers = ranked.length > 0;

  return (
    <div
      className="tvboard"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        background: C.bg,
        color: C.text,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        // Базовый размер шрифта табло: 1vw → крупно на ТВ, масштабируется с экраном.
        // На узком экране (телефон) 1vw слишком мелко — поднимаем нижнюю границу
        // clamp до 16px и добавляем vw-компонент покрупнее (переопределяется в CSS).
        fontSize: "clamp(14px, 1vw, 26px)",
        zIndex: 9999,
        userSelect: "none",
      }}
    >
      {/* Адаптивные правила (media queries нельзя в inline-style → инжектим <style>).
          На узком экране (≤600px): шрифт крупнее (vw-based), все сетки в 1 колонку,
          вертикальный скролл внутри слайда вместо обрезки, перенос навигации. */}
      <TvResponsiveStyles />

      {/* Крестик выхода (только приватный режим — когда задан exitHref) */}
      {exitHref && (
        <a
          href={exitHref}
          aria-label="Выйти из ТВ-режима"
          title="Выйти из ТВ-режима"
          style={{
            position: "absolute",
            top: "1.6vh",
            right: "1.4vw",
            zIndex: 10000,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "clamp(34px, 3vw, 52px)",
            height: "clamp(34px, 3vw, 52px)",
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            background: "rgba(22,26,43,0.85)",
            color: C.textDim,
            textDecoration: "none",
          }}
        >
          <X size={20} />
        </a>
      )}

      <TvHeader period={period} basePath={basePath} />

      {/* Основная область — карусель. Один слайд видим, остальные fade-out. */}
      <div className="tvboard-stage" style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {!hasManagers ? (
          <EmptyState />
        ) : (
          <>
            {slides.map((sl, i) => (
              <Slide key={i} active={slide === i}>
                {sl.kind === "overview" ? (
                  <OverviewSlide
                    data={data}
                    rating={sl.rating}
                    startRank={sl.startRank}
                    showKpi={sl.showKpi}
                    part={sl.part}
                    parts={sl.parts}
                  />
                ) : (
                  <ManagerSlide
                    m={sl.m}
                    rank={sl.rank}
                    contactThreshold={data.contactThreshold}
                  />
                )}
              </Slide>
            ))}

            {/* Стрелки навигации — для пульта/мыши на ТВ (скролла нет) */}
            {slideCount > 1 && (
              <>
                <NavArrow side="left" onClick={() => go(-1)} />
                <NavArrow side="right" onClick={() => go(1)} />
              </>
            )}
          </>
        )}
      </div>

      {/* Индикатор-точки */}
      {hasManagers && slideCount > 1 && (
        <Dots count={slideCount} active={slide} onPick={setSlide} />
      )}
    </div>
  );
}

// ───────────────────────── Адаптивные стили (media queries) ─────────────────────────

/**
 * Инжектит media-query CSS, которое нельзя выразить инлайн-стилями.
 * На узком экране (≤600px, телефон в портрете) перестраивает табло на вертикальную
 * читаемую раскладку, при этом на ТВ/десктопе (>600px) ничего не меняется.
 *
 * Завязка на className-хуки: .tvboard (корень), .tvboard-stage (область карусели),
 * .tv-kpi-grid / .tv-rating-row / .tv-mgr-main / .tv-mgr-metrics / .tv-mgr-bottom /
 * .tv-header / .tv-period-nav (см. соответствующие компоненты).
 */
function TvResponsiveStyles() {
  return (
    <style>{`
      @media (max-width: 600px) {
        /* Базовый шрифт покрупнее: на телефоне 1vw мелковат → даём ~2.6vw */
        .tvboard { font-size: clamp(15px, 2.6vw, 22px) !important; }

        /* Шапка: название + период + часы переносятся, не наезжают */
        .tv-header { flex-wrap: wrap !important; gap: 1vh 3vw !important; padding: 1.4vh 4vw !important; }
        .tv-period-nav { flex-wrap: wrap !important; justify-content: center !important; order: 3; width: 100%; gap: 2vw !important; }
        .tv-period-link { padding: 0.8vh 4vw !important; }

        /* Слайд может скроллиться по вертикали, чтобы контент не обрезался */
        .tvboard-slide { overflow-y: auto !important; padding: 2vh 4vw !important; }

        /* KPI-плитки обзора — в две колонки (вместо шести) */
        .tv-kpi-grid { grid-template-columns: 1fr 1fr !important; gap: 2vw !important; }

        /* Строки рейтинга — вертикально (ФИО сверху, метрики в ряд снизу) */
        .tv-rating-row { flex-direction: column !important; align-items: stretch !important; gap: 1vh !important; }
        .tv-rating-metrics { justify-content: space-between !important; gap: 4vw !important; }
        .tv-rating-metrics > div { min-width: 0 !important; text-align: center !important; }

        /* Слайд менеджера: огромная оценка над метриками (одна колонка) */
        .tv-mgr-main { grid-template-columns: 1fr !important; }
        .tv-mgr-metrics-grid { grid-template-columns: 1fr 1fr !important; }
        .tv-mgr-bottom { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}

// ───────────────────────── Шапка ─────────────────────────

function TvHeader({ period, basePath }: { period: Props["period"]; basePath: string }) {
  const [clock, setClock] = useState(() => fmtClock(new Date()));
  // Часы тикают каждую секунду (формат ЧЧ:ММ)
  useEffect(() => {
    const t = setInterval(() => setClock(fmtClock(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  const label =
    period === "today" ? "Сегодня" : period === "week" ? "Неделя" : "Месяц";

  return (
    <header
      className="tv-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1.6vh 2.2vw",
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
        gap: "2vw",
      }}
    >
      {/* Слева — название + период текстом */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "1.2vw", minWidth: 0 }}>
        <span style={{ fontSize: "2em", fontWeight: 800, letterSpacing: "-0.01em" }}>
          Отдел продаж
        </span>
        <span style={{ fontSize: "1.1em", color: C.textDim }}>· {label}</span>
      </div>

      {/* По центру — переключатель периода крупными кнопками-ссылками */}
      <nav className="tv-period-nav" style={{ display: "flex", gap: "0.8vw" }}>
        <PeriodLink basePath={basePath} value="today" current={period} label="Сегодня" />
        <PeriodLink basePath={basePath} value="week" current={period} label="Неделя" />
        <PeriodLink basePath={basePath} value="month" current={period} label="Месяц" />
      </nav>

      {/* Справа — часы */}
      <div
        style={{
          fontSize: "2.2em",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.02em",
        }}
      >
        {clock}
      </div>
    </header>
  );
}

function PeriodLink({
  basePath,
  value,
  current,
  label,
}: {
  basePath: string;
  value: Props["period"];
  current: Props["period"];
  label: string;
}) {
  const active = value === current;
  // Ссылка на тот же URL с другим period (сохраняем tv=1). Смена периода = серверная перезагрузка.
  const href = `${basePath}?tv=1&period=${value}`;
  return (
    <a
      href={href}
      className="tv-period-link"
      style={{
        display: "inline-flex",
        alignItems: "center",
        textDecoration: "none",
        padding: "0.7vh 1.6vw",
        borderRadius: 12,
        fontSize: "1.15em",
        fontWeight: 700,
        border: `2px solid ${active ? C.accent : C.border}`,
        background: active ? C.accent : "transparent",
        color: active ? "#fff" : C.textDim,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </a>
  );
}

// ───────────────────────── Слайд-обёртка (fade) ─────────────────────────

function Slide({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className="tvboard-slide"
      style={{
        position: "absolute",
        inset: 0,
        padding: "2vh 2.2vw",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        // Плавный fade + лёгкий сдвиг
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
        pointerEvents: active ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

// ───────────────────────── Слайд 0 — ОБЗОР ─────────────────────────

function OverviewSlide({
  data,
  rating,
  startRank,
  showKpi,
  part,
  parts,
}: {
  data: DashboardData;
  rating: ManagerStatsRow[];
  startRank: number;
  showKpi: boolean;
  part: number;
  parts: number;
}) {
  const { totals, aggs } = data;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "2vh", minHeight: 0 }}>
      {/* Крупные KPI-плитки — только на первом обзорном слайде */}
      {showKpi && (
        <div
          className="tv-kpi-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "1.2vw",
            flexShrink: 0,
          }}
        >
          <KpiTile label="Всего звонков" value={String(totals.total)} />
          <KpiTile label="Проанализировано" value={String(totals.done)} color={C.good} />
          <KpiTile
            label="Ср. оценка"
            value={aggs.avg_score != null ? `${aggs.avg_score.toFixed(1)}` : "—"}
            suffix={aggs.avg_score != null ? "/ 10" : undefined}
            color={aggs.avg_score != null ? scoreColor(aggs.avg_score) : undefined}
          />
          <KpiTile
            label="Ср. чек-лист"
            value={aggs.avg_compliance != null ? `${Math.round(aggs.avg_compliance * 100)}%` : "—"}
            color={C.accent}
          />
          <KpiTile label="Вход / Исход" value={`${totals.incoming} / ${totals.outgoing}`} />
          <KpiTile label="Время разговоров" value={fmtMinutes(totals.total_duration)} />
        </div>
      )}

      {/* Рейтинг менеджеров — порция, влезающая в экран */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: "1.6vh 1.8vw",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: "1.3em",
            fontWeight: 700,
            marginBottom: "1.2vh",
            color: C.textDim,
            flexShrink: 0,
          }}
        >
          Рейтинг менеджеров{parts > 1 ? ` · ${part}/${parts}` : ""}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.7vh" }}>
          {rating.map((m, i) => (
            <RatingRow key={m.manager_id} m={m} rank={startRank + i + 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: string;
  suffix?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "1.6vh 1.2vw",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "0.6vh",
      }}
    >
      <div style={{ fontSize: "0.85em", color: C.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4vw" }}>
        <span style={{ fontSize: "2.6em", fontWeight: 800, lineHeight: 1, color: color || C.text }}>
          {value}
        </span>
        {suffix && <span style={{ fontSize: "1.1em", color: C.textDim }}>{suffix}</span>}
      </div>
    </div>
  );
}

function RatingRow({ m, rank }: { m: ManagerStatsRow; rank: number }) {
  const score = m.avg_score;
  const col = score != null ? scoreColor(score) : C.textDim;
  return (
    <div
      className="tv-rating-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1.4vw",
        background: C.panelAlt,
        borderRadius: 12,
        padding: "1vh 1.2vw",
      }}
    >
      {/* Место + ФИО — занимают всё свободное место слева */}
      <div className="tv-rating-head" style={{ display: "flex", alignItems: "center", gap: "1.4vw", flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: "2.2em",
            textAlign: "center",
            fontSize: "1.3em",
            fontWeight: 800,
            color: rank <= 3 ? C.accent : C.textDim,
            flexShrink: 0,
          }}
        >
          {rank}
        </div>
        {/* ФИО */}
        <div style={{ fontSize: "1.4em", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.manager_name || `ID ${m.manager_id}`}
        </div>
      </div>
      {/* Метрики справа (на мобиле — переносятся под имя одним рядом) */}
      <div className="tv-rating-metrics" style={{ display: "flex", alignItems: "center", gap: "1.4vw", flexShrink: 0 }}>
        {/* Оценка */}
        <Metric label="оценка" value={score != null ? score.toFixed(1) : "—"} color={col} big />
        {/* Чек-лист */}
        <Metric
          label="чек-лист"
          value={m.avg_compliance != null ? `${Math.round(m.avg_compliance * 100)}%` : "—"}
        />
        {/* Звонки */}
        <Metric label="звонки" value={String(m.calls)} />
      </div>
    </div>
  );
}

function Metric({ label, value, color, big }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div style={{ textAlign: "right", minWidth: "4.5em" }}>
      <div style={{ fontSize: big ? "1.8em" : "1.3em", fontWeight: 800, lineHeight: 1, color: color || C.text }}>
        {value}
      </div>
      <div style={{ fontSize: "0.7em", color: C.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
    </div>
  );
}

// ───────────────────────── Слайд менеджера ─────────────────────────

function ManagerSlide({
  m,
  rank,
  contactThreshold,
}: {
  m: ManagerStatsRow;
  rank: number;
  contactThreshold: number;
}) {
  const score = m.avg_score;
  const col = score != null ? scoreColor(score) : C.textDim;
  const contactPct = m.calls > 0 ? Math.round((m.connected / m.calls) * 100) : 0;
  const sentTotal = m.pos + m.neu + m.neg;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "2.5vh" }}>
      {/* Шапка слайда: аватар-инициалы + ФИО + место */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.8vw", flexShrink: 0 }}>
        <div
          style={{
            width: "5.5em",
            height: "5.5em",
            borderRadius: "50%",
            background: C.accent,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2.2em",
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials(m.manager_name || `ID ${m.manager_id}`)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "3.4em", fontWeight: 800, lineHeight: 1.05 }}>
            {m.manager_name || `ID ${m.manager_id}`}
          </div>
          <div style={{ fontSize: "1.4em", color: C.accent, fontWeight: 700, marginTop: "0.4vh" }}>
            #{rank} в рейтинге
          </div>
        </div>
      </div>

      {/* Главная зона: огромная оценка слева + метрики справа */}
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "1.8vw" }}>
        {/* Огромная оценка */}
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1vh",
          }}
        >
          <div style={{ fontSize: "1.3em", color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Средняя оценка
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4vw" }}>
            <span style={{ fontSize: "9em", fontWeight: 800, lineHeight: 0.9, color: col }}>
              {score != null ? score.toFixed(1) : "—"}
            </span>
            {score != null && <span style={{ fontSize: "2.4em", color: C.textDim, fontWeight: 700 }}>/ 10</span>}
          </div>
        </div>

        {/* Сетка метрик 2×2 + тональность */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.6vh", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.6vh 1.4vw", flex: 1, minHeight: 0 }}>
            <BigStat label="Чек-лист" value={m.avg_compliance != null ? `${Math.round(m.avg_compliance * 100)}%` : "—"} color={C.accent} />
            <BigStat label="Всего звонков" value={String(m.calls)} />
            <BigStat label="Минут разговоров" value={fmtMinutes(m.total_seconds)} />
            <BigStat label={`% контактов (≥${contactThreshold}с)`} value={`${contactPct}%`} color={C.good} />
          </div>

          {/* Пропущенные + бар тональности */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1.4vw", alignItems: "stretch", flexShrink: 0 }}>
            <BigStat label="Пропущенные" value={String(m.missed)} color={m.missed > 0 ? C.bad : C.textDim} compact />
            <div
              style={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 18,
                padding: "1.4vh 1.4vw",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: "1vh",
              }}
            >
              <div style={{ fontSize: "0.95em", color: C.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Настроение заказчиков
              </div>
              {sentTotal === 0 ? (
                <div style={{ fontSize: "1.2em", color: C.textDim }}>—</div>
              ) : (
                <>
                  <div style={{ display: "flex", height: "1.6vh", borderRadius: 999, overflow: "hidden", background: C.panelAlt }}>
                    <div style={{ width: `${(m.pos / sentTotal) * 100}%`, background: C.good }} />
                    <div style={{ width: `${(m.neu / sentTotal) * 100}%`, background: C.neutral }} />
                    <div style={{ width: `${(m.neg / sentTotal) * 100}%`, background: C.bad }} />
                  </div>
                  <div style={{ display: "flex", gap: "1.6vw", fontSize: "1.1em", fontWeight: 700 }}>
                    <span style={{ color: C.good }}>+{m.pos}</span>
                    <span style={{ color: C.neutral }}>={m.neu}</span>
                    <span style={{ color: C.bad }}>−{m.neg}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  color,
  compact,
}: {
  label: string;
  value: string;
  color?: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: compact ? "1.4vh 1.6vw" : "1.6vh 1.6vw",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "0.6vh",
        minWidth: compact ? "9em" : undefined,
      }}
    >
      <div style={{ fontSize: "0.95em", color: C.textDim, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: compact ? "2.6em" : "3em", fontWeight: 800, lineHeight: 1, color: color || C.text }}>
        {value}
      </div>
    </div>
  );
}

// ───────────────────────── Стрелки навигации ─────────────────────────

/**
 * Большая полупрозрачная стрелка по краю экрана для ручного листания
 * (мышью на ТВ-приставке или кликом). Клавиатура/пульт обрабатываются отдельно.
 */
function NavArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Предыдущий слайд" : "Следующий слайд"}
      className="tv-nav-arrow"
      style={{
        position: "absolute",
        top: "50%",
        left: side === "left" ? "1.2vw" : undefined,
        right: side === "right" ? "1.2vw" : undefined,
        transform: "translateY(-50%)",
        zIndex: 20,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "clamp(40px, 3.6vw, 68px)",
        height: "clamp(40px, 3.6vw, 68px)",
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        background: "rgba(22,26,43,0.72)",
        color: C.text,
        cursor: "pointer",
        padding: 0,
      }}
    >
      {side === "left" ? <ChevronLeft size={30} /> : <ChevronRight size={30} />}
    </button>
  );
}

// ───────────────────────── Индикатор-точки ─────────────────────────

function Dots({ count, active, onPick }: { count: number; active: number; onPick: (i: number) => void }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "0.8vw",
        padding: "1.4vh 0",
        flexShrink: 0,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(i)}
          aria-label={`Слайд ${i + 1}`}
          style={{
            width: i === active ? "2.4vw" : "0.9vw",
            maxWidth: i === active ? 48 : 18,
            minWidth: i === active ? 24 : 9,
            height: "0.9vh",
            minHeight: 8,
            borderRadius: 999,
            border: "none",
            padding: 0,
            cursor: "pointer",
            background: i === active ? C.accent : C.border,
            transition: "width 0.4s ease, background 0.4s ease",
          }}
        />
      ))}
    </div>
  );
}

// ───────────────────────── Заглушка ─────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "2vh",
        color: C.textDim,
      }}
    >
      <div style={{ fontSize: "3em", fontWeight: 800 }}>Нет данных за период</div>
      <div style={{ fontSize: "1.3em" }}>Выберите другой период вверху</div>
    </div>
  );
}

// ───────────────────────── helpers ─────────────────────────

/** Сортировка менеджеров по оценке DESC; безоценочные (null) — в конце. */
function rankManagers(list: ManagerStatsRow[]): ManagerStatsRow[] {
  return [...list].sort((a, b) => {
    const sa = a.avg_score;
    const sb = b.avg_score;
    if (sa == null && sb == null) return b.calls - a.calls; // оба без оценки → по звонкам
    if (sa == null) return 1; // a в конец
    if (sb == null) return -1; // b в конец
    if (sb !== sa) return sb - sa; // по убыванию оценки
    return b.calls - a.calls; // тай-брейк по звонкам
  });
}

/** Цвет оценки: зелёный ≥7, жёлтый 5..7, красный <5. */
function scoreColor(score: number): string {
  if (score >= 7) return C.good;
  if (score >= 5) return C.warn;
  return C.bad;
}

/** Инициалы (до 2 букв) из ФИО. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Секунды → «X ч Y мин» / «X мин» / «<1 мин» / «—» (как в dashboard-data/reports). */
function fmtMinutes(sec: number): string {
  if (!sec) return "—";
  const totalMin = Math.round(sec / 60);
  if (totalMin === 0) return "<1 мин";
  if (totalMin < 60) return `${totalMin} мин`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins ? `${hours} ч ${mins} мин` : `${hours} ч`;
}

/** Текущее время → «ЧЧ:ММ». */
function fmtClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
