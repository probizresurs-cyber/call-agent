/**
 * Генерация текстовых отчётов для рассылки в Bitrix24-мессенджер.
 *
 * Текст формируется в BBCode ([B], [URL], переносы строк) — он рассчитан
 * на отправку через lib/bitrix-im.ts imSendMessage.
 *
 * Два типа отчёта (scope):
 *   - "manager" — персональный по одному менеджеру (для самого менеджера)
 *   - "team"    — сводный по всей команде (для руководителя/РОП)
 *
 * Данные берём из loadDashboardData — единого источника метрик дашборда,
 * чтобы цифры в отчёте совпадали с тем что менеджер видит в кабинете.
 */
import { loadDashboardData } from "./dashboard-data";

export interface ReportOpts {
  tenantId: number;
  scope: "manager" | "team";   // персональный по менеджеру ИЛИ общий по команде
  managerId?: string;          // обязателен для scope='manager' (Bitrix manager_id)
  from?: string;               // ISO YYYY-MM-DD
  to?: string;
  periodLabel?: string;        // человекочитаемое «за неделю», «вчера» (для заголовка)
}

export interface GeneratedReport {
  title: string;
  text: string;   // BBCode
}

/** Секунды → «X ч Y мин» или «Y мин» (часы опускаем если их нет). */
function formatMinutes(totalSeconds: number): string {
  const totalMinutes = Math.round((totalSeconds || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

/** Округление оценки 0..10 (одна цифра после запятой) либо «—» если null. */
function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return (Math.round(value * 10) / 10).toString();
}

/** Чек-лист 0..1 → проценты (целое) либо «—» если null. */
function formatCompliancePct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Префикс заголовка: « за неделю» с ведущим пробелом, либо пусто. */
function periodSuffix(periodLabel?: string): string {
  const p = periodLabel?.trim();
  return p ? ` ${p}` : "";
}

const DASHBOARD_URL = "https://marketradar24.ru/call-agent/dashboard";

export async function generateReport(opts: ReportOpts): Promise<GeneratedReport> {
  if (opts.scope === "manager") {
    return buildManagerReport(opts);
  }
  return buildTeamReport(opts);
}

async function buildManagerReport(opts: ReportOpts): Promise<GeneratedReport> {
  const data = await loadDashboardData({
    tenantId: opts.tenantId,
    from: opts.from,
    to: opts.to,
    managerId: opts.managerId,
  });

  const suffix = periodSuffix(opts.periodLabel);
  const title = `📊 Ваш отчёт${suffix}`;

  const { totals, aggs } = data;
  // Пропущенные не лежат в totals — берём из агрегата по менеджеру (allManagers
  // под фильтром managerId содержит максимум одну строку).
  const missed = data.allManagers.reduce((acc, m) => acc + (m.missed || 0), 0);

  const lines: string[] = [];
  lines.push(`[B]${title}[/B]`);
  lines.push("");
  lines.push(`Звонков: ${totals.total} (входящих ${totals.incoming} / исходящих ${totals.outgoing})`);
  lines.push(`Пропущенных: ${missed}`);
  lines.push(`Минут разговоров: ${formatMinutes(totals.total_duration)}`);
  lines.push(`Средняя оценка: ${formatScore(aggs.avg_score)}/10`);
  lines.push(`Чек-лист: ${formatCompliancePct(aggs.avg_compliance)}`);
  lines.push("");

  // Зоны роста — топ-3 худших пункта чек-листа (breakdown уже отсортирован по
  // pass_rate ASC, т.е. худшие сверху).
  const worst = data.checklistItemsBreakdown.slice(0, 3);
  if (worst.length > 0) {
    lines.push("[B]Зоны роста:[/B]");
    for (const item of worst) {
      const pct = Math.round(item.pass_rate * 100);
      lines.push(`- ${item.title}: ${pct}% выполнения`);
    }
    lines.push("");
  }

  // Частые возражения (если есть данные).
  if (data.topObjections.length > 0) {
    const objText = data.topObjections.slice(0, 5).map((o) => o.title).join(", ");
    lines.push(`Частые возражения: ${objText}`);
    lines.push("");
  }

  lines.push(`Подробнее: ${DASHBOARD_URL}`);

  return { title, text: lines.join("\n") };
}

async function buildTeamReport(opts: ReportOpts): Promise<GeneratedReport> {
  const data = await loadDashboardData({
    tenantId: opts.tenantId,
    from: opts.from,
    to: opts.to,
  });

  const suffix = periodSuffix(opts.periodLabel);
  const title = `📊 Отчёт по команде${suffix}`;

  const { totals, aggs } = data;

  const lines: string[] = [];
  lines.push(`[B]${title}[/B]`);
  lines.push("");
  lines.push(`Всего звонков: ${totals.total}, проанализировано: ${totals.done}`);
  lines.push(`Средняя оценка команды: ${formatScore(aggs.avg_score)}/10`);
  lines.push(`Средний чек-лист: ${formatCompliancePct(aggs.avg_compliance)}`);
  lines.push("");

  if (data.allManagers.length > 0) {
    lines.push("[B]По менеджерам:[/B]");
    for (const m of data.allManagers) {
      const name = (m.manager_name && m.manager_name.trim()) || `ID ${m.manager_id}`;
      lines.push(
        `${name}: ${m.calls} звонков, оценка ${formatScore(m.avg_score)}, ` +
        `чек-лист ${formatCompliancePct(m.avg_compliance)}`
      );
    }
    lines.push("");
  }

  lines.push(`Подробнее: ${DASHBOARD_URL}`);

  return { title, text: lines.join("\n") };
}
