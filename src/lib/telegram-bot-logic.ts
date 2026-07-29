/**
 * Общая логика Telegram-бота отчётов Call-Agent — переиспользуется polling-скриптом
 * (scripts/telegram-poll.ts, основной режим) и webhook-роутом (запасной вариант,
 * см. src/app/api/telegram/webhook/route.ts).
 *
 * Сценарий: пользователь пишет боту → меню (inline-кнопки) с теми же пресетами
 * периода, что в личном кабинете (/reports): Сегодня / Вчера / Эта неделя /
 * Прошлая неделя / Этот месяц / Прошлый месяц / За всё время / За конкретную дату.
 * Нажатие кнопки → генерируем отчёт по отделу и присылаем текст.
 * «За конкретную дату» → просим прислать дату ДД.ММ.ГГГГ, любое сообщение-дата
 *   → отчёт за этот день.
 *
 * Расчёт диапазонов дат — как в PRESETS из ReportsClient.tsx (неделя с
 * понедельника), чтобы периоды в боте и в кабинете совпадали день в день.
 *
 * ДОСТУП (данные продаж — чувствительные):
 *   CA_TELEGRAM_ALLOWED_CHAT_IDS — список разрешённых chat_id через запятую.
 *   Спецзначение "*" — временный режим «отвечать всем» (для настройки/теста),
 *   отключить, заменив на конкретные chat_id, как только они известны.
 *   Пусто → доступа нет ни у кого (безопасный дефолт).
 *   Незнакомому чату бот присылает его chat_id — так его и узнают.
 */
import { tgSendMessage, tgAnswerCallback, type TgUpdate } from "./telegram";
import { loadDashboardData } from "./dashboard-data";
import { getDbAsync } from "./db-compat";

const TENANT_ID = parseInt(process.env.CA_TELEGRAM_TENANT_ID || "1", 10) || 1;
const DASHBOARD_URL = "https://marketradar24.ru/call-agent/dashboard";

type PeriodKey =
  | "today" | "yesterday" | "this_week" | "last_week"
  | "this_month" | "last_month" | "all_time";

// Меню отчётов (inline-клавиатура) — те же пресеты, что в /reports.
const MENU = {
  inline_keyboard: [
    [{ text: "Сегодня", callback_data: "rep:today" }, { text: "Вчера", callback_data: "rep:yesterday" }],
    [{ text: "Эта неделя", callback_data: "rep:this_week" }, { text: "Прошлая неделя", callback_data: "rep:last_week" }],
    [{ text: "Этот месяц", callback_data: "rep:this_month" }, { text: "Прошлый месяц", callback_data: "rep:last_month" }],
    [{ text: "За всё время", callback_data: "rep:all_time" }],
    [{ text: "За конкретную дату", callback_data: "rep:date" }],
  ],
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  this_week: "Эта неделя",
  last_week: "Прошлая неделя",
  this_month: "Этот месяц",
  last_month: "Прошлый месяц",
  all_time: "За всё время",
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** Понедельник как начало недели — как startOfWeek() в ReportsClient.tsx. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Диапазон дат для пресета — те же формулы, что PRESETS в ReportsClient.tsx. */
function resolvePeriodKey(key: PeriodKey): { from: string; to: string } {
  const now = new Date();
  switch (key) {
    case "today": {
      const t = isoDate(now);
      return { from: t, to: t };
    }
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      const s = isoDate(d);
      return { from: s, to: s };
    }
    case "this_week":
      return { from: isoDate(startOfWeek(now)), to: isoDate(now) };
    case "last_week": {
      const start = startOfWeek(now);
      const lastEnd = new Date(start);
      lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfWeek(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    }
    case "this_month":
      return { from: isoDate(startOfMonth(now)), to: isoDate(now) };
    case "last_month": {
      const s = startOfMonth(now);
      const lastEnd = new Date(s);
      lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfMonth(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    }
    case "all_time":
      // Заглушка на случай сбоя запроса реальной даты — см. getFirstCallDate().
      return { from: "2000-01-01", to: isoDate(now) };
  }
}

/** Дата первого звонка тенанта (для периода «за всё время» — вместо условной
 *  заглушки 2000-01-01). Если звонков ещё нет или запрос не удался — null. */
async function getFirstCallDate(tenantId: number): Promise<string | null> {
  try {
    const db = getDbAsync();
    const row = await db
      .prepare(
        `SELECT MIN(started_at) AS first FROM calls WHERE tenant_id = ? AND started_at IS NOT NULL`
      )
      .get<{ first: string | null }>(tenantId);
    return row?.first ? row.first.slice(0, 10) : null; // ISO YYYY-MM-DD
  } catch {
    return null;
  }
}

/** "*" → разрешено всем (временный режим); иначе — allowlist конкретных chat_id. */
function isAllowed(chatId: string): boolean {
  const raw = (process.env.CA_TELEGRAM_ALLOWED_CHAT_IDS || "").trim();
  if (raw === "*") return true;
  const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return set.size > 0 && set.has(chatId);
}

/** Ответ незнакомому чату: показываем его chat_id для подключения. */
async function denyReply(chatId: string) {
  await tgSendMessage(
    chatId,
    `Доступ к отчётам ограничен.\nВаш chat ID: ${chatId}\nПередайте этот ID администратору, чтобы получить доступ.`
  );
}

/** Разобрать дату из текста: ДД.ММ.ГГГГ / ДД-ММ-ГГГГ / ГГГГ-ММ-ДД → ISO YYYY-MM-DD. */
function parseDate(text: string): string | null {
  let m = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${m[3]}-${mo}-${d}`;
    return null;
  }
  m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return text;
  return null;
}

/** ISO YYYY-MM-DD → ДД.ММ.ГГГГ. */
function ruDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/** Экранирование для Telegram HTML parse_mode (вне тегов — только &, <, >). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Оценка 0..10 (одна цифра после запятой) либо «—». */
function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return (Math.round(v * 10) / 10).toString();
}
/** Чек-лист 0..1 → проценты либо «—». */
function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v * 100)}%`;
}
/** Строка с датой периода: один день → «📅 09.06.2026», диапазон → «📅 09.06 — 10.06.2026». */
function fmtDateLine(from: string, to: string): string {
  const f = ruDate(from);
  const t = ruDate(to);
  return f === t ? `📅 ${f}` : `📅 ${f} — ${t}`;
}

/**
 * Отчёт по команде в HTML-разметке Telegram (не BBCode Bitrix — Telegram его
 * не понимает и показывает теги [B]/[/B] как есть). Таблица по менеджерам —
 * моноширинный блок <pre>, чтобы столбцы совпадали, а не шли сплошным текстом.
 */
async function buildTelegramTeamReport(
  tenantId: number,
  from: string,
  to: string,
  periodLabel: string
): Promise<string> {
  const data = await loadDashboardData({ tenantId, from, to });
  const { totals, aggs } = data;

  const lines: string[] = [];
  lines.push(`<b>📊 Отчёт по команде ${escapeHtml(periodLabel)}</b>`);
  lines.push(fmtDateLine(from, to));
  lines.push("");
  lines.push(`Всего звонков: ${totals.total}, проанализировано: ${totals.done}`);
  lines.push(`Средняя оценка команды: ${fmtScore(aggs.avg_score)}/10`);
  lines.push(`Средний чек-лист: ${fmtPct(aggs.avg_compliance)}`);
  lines.push("");

  if (data.allManagers.length > 0) {
    lines.push("<b>По менеджерам:</b>");

    const rows = data.allManagers.map((m) => ({
      name: escapeHtml((m.manager_name && m.manager_name.trim()) || `ID ${m.manager_id}`),
      calls: String(m.calls),
      score: fmtScore(m.avg_score),
      pct: fmtPct(m.avg_compliance),
    }));
    const nameW = Math.max("Менеджер".length, ...rows.map((r) => r.name.length)) + 1;

    const header =
      "Менеджер".padEnd(nameW) + "Звонки".padStart(7) + "Оценка".padStart(8) + "Чек-лист".padStart(10);
    const body = rows
      .map((r) => r.name.padEnd(nameW) + r.calls.padStart(7) + r.score.padStart(8) + r.pct.padStart(10))
      .join("\n");

    lines.push(`<pre>${header}\n${body}</pre>`);
    lines.push("");
  }

  lines.push(`Подробнее: ${DASHBOARD_URL}`);
  return lines.join("\n");
}

/** Сгенерировать и отправить отчёт по команде (пресет периода или конкретная дата). */
async function sendReport(chatId: string, kind: PeriodKey | "date", date?: string) {
  let from: string;
  let to: string;
  let label: string;
  if (kind === "date") {
    from = date!;
    to = date!;
    label = ruDate(date!);
  } else {
    const r = resolvePeriodKey(kind);
    from = r.from;
    to = r.to;
    label = PERIOD_LABELS[kind];
    // «За всё время» — реальная дата первого звонка вместо условной 2000-01-01.
    if (kind === "all_time") {
      const first = await getFirstCallDate(TENANT_ID);
      if (first) from = first;
    }
  }

  await tgSendMessage(chatId, "Готовлю отчёт…");
  try {
    const text = await buildTelegramTeamReport(TENANT_ID, from, to, label);
    await tgSendMessage(chatId, text, { parse_mode: "HTML", reply_markup: MENU });
  } catch (e) {
    await tgSendMessage(
      chatId,
      `Не удалось построить отчёт: ${e instanceof Error ? e.message : "ошибка"}. Попробуйте ещё раз.`,
      { reply_markup: MENU }
    );
  }
}

/** Обработать один апдейт Telegram (сообщение или нажатие кнопки). */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  // ── Нажатие inline-кнопки ──
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? "");
    await tgAnswerCallback(cq.id);
    if (!chatId) return;
    if (!isAllowed(chatId)) {
      await denyReply(chatId);
      return;
    }
    const data = String(cq.data || "");
    if (data === "rep:date") {
      await tgSendMessage(chatId, "Пришлите дату в формате ДД.ММ.ГГГГ (например, 05.02.2026).");
    } else if (data.startsWith("rep:")) {
      const key = data.slice(4) as PeriodKey;
      if (key in PERIOD_LABELS) await sendReport(chatId, key);
    }
    return;
  }

  // ── Обычное сообщение ──
  const msg = update.message;
  if (msg?.chat?.id != null) {
    const chatId = String(msg.chat.id);
    const text = String(msg.text || "").trim();
    if (!isAllowed(chatId)) {
      await denyReply(chatId);
      return;
    }
    // Сообщение-дата → отчёт за конкретный день.
    const date = parseDate(text);
    if (date) {
      await sendReport(chatId, "date", date);
      return;
    }
    // /start или любой другой текст → показываем меню.
    await tgSendMessage(chatId, "Выберите отчёт по отделу продаж:", { reply_markup: MENU });
  }
}
