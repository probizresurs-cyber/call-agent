/**
 * Расписания автоматической отправки отчётов в Bitrix.
 *
 * Сущность report_schedule:
 *   - кому отправлять (recipient_kind='user'|'chat', recipient_id=bitrix user id или "chatN")
 *   - с какой частотой (frequency='daily'|'weekly', time_hhmm, days_of_week)
 *   - за какой период (period_kind: yesterday/today/last_7_days/last_week/this_week/last_month)
 *   - какой именно отчёт (scope='manager'|'team', manager_id)
 *
 * worker.ts раз в минуту дёргает getDueSchedules() и для каждого вызывает runScheduled().
 */
import { getDbAsync } from "./db-compat";
import { generateReport } from "./reports";
import { imSendMessage } from "./bitrix-im";

export type ScheduleScope = "manager" | "team";
export type ScheduleFrequency = "daily" | "weekly";
export type ScheduleRecipientKind = "user" | "chat";
export type SchedulePeriodKind =
  | "yesterday"
  | "today"
  | "last_7_days"
  | "last_week"
  | "this_week"
  | "last_month";

export interface ScheduleRow {
  id: number;
  tenant_id: number;
  name: string;
  scope: ScheduleScope;
  manager_id: string | null;
  recipient_kind: ScheduleRecipientKind;
  recipient_id: string;
  recipient_name: string | null;
  frequency: ScheduleFrequency;
  time_hhmm: string;
  days_of_week: string | null; // JSON array [1..7] (1=пн,7=вс) для weekly
  period_kind: SchedulePeriodKind;
  enabled: boolean | number; // pg: bool, sqlite: 0/1
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleInput {
  tenantId: number;
  name: string;
  scope: ScheduleScope;
  managerId?: string | null;
  recipientKind: ScheduleRecipientKind;
  recipientId: string;
  recipientName?: string | null;
  frequency: ScheduleFrequency;
  time: string;                 // HH:MM
  daysOfWeek?: number[] | null; // 1..7 для weekly
  periodKind: SchedulePeriodKind;
  enabled?: boolean;
}

// ───────────────────────────────────────────────────────────────────
// Расчёт next_run_at

/** Хелпер: установить часы/минуты + сбросить секунды/мс. */
function setHM(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  const out = new Date(d);
  out.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return out;
}

/** Хелпер: 1..7 (пн..вс) для Date. */
function isoDayOfWeek(d: Date): number {
  const js = d.getDay(); // 0=вс,1=пн,...,6=сб
  return js === 0 ? 7 : js;
}

/**
 * Вычислить следующее срабатывание расписания.
 *
 *  - daily: сегодня в time, если ещё не наступило; иначе завтра в time.
 *  - weekly: ближайший день из days_of_week (1..7) ≥ fromDate с указанным time.
 */
export function computeNextRunAt(
  schedule: Pick<ScheduleRow, "frequency" | "time_hhmm" | "days_of_week">,
  fromDate: Date = new Date()
): Date {
  const base = new Date(fromDate);
  base.setSeconds(0, 0);

  if (schedule.frequency === "daily") {
    const today = setHM(base, schedule.time_hhmm);
    if (today.getTime() > base.getTime()) return today;
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // weekly
  let days: number[] = [];
  try {
    if (schedule.days_of_week) days = JSON.parse(schedule.days_of_week) as number[];
  } catch {
    days = [];
  }
  days = days.filter((d) => Number.isFinite(d) && d >= 1 && d <= 7);
  if (days.length === 0) {
    // Защита от мусорных данных: считаем как daily, чтобы не зависнуть.
    return computeNextRunAt({ ...schedule, frequency: "daily" }, fromDate);
  }

  // Ищем в окне 0..7 дней вперёд первый день из списка с подходящим временем.
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(base);
    candidate.setDate(candidate.getDate() + offset);
    const at = setHM(candidate, schedule.time_hhmm);
    if (!days.includes(isoDayOfWeek(at))) continue;
    if (at.getTime() > base.getTime()) return at;
  }
  // На всякий случай (теоретически недостижимо): на 7 дней вперёд от base.
  const fallback = setHM(base, schedule.time_hhmm);
  fallback.setDate(fallback.getDate() + 7);
  return fallback;
}

// ───────────────────────────────────────────────────────────────────
// Период (для какого диапазона дат строить отчёт)

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfWeekMon(d: Date): Date {
  // Понедельник как первый день недели (как везде в проекте).
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Разрешить тип периода в конкретный диапазон дат (ISO YYYY-MM-DD).
 * Текст label соответствует пресетам в ReportsClient — для единообразия в заголовке.
 */
export function resolvePeriod(
  periodKind: SchedulePeriodKind,
  now: Date = new Date()
): { from: string; to: string; label: string } {
  switch (periodKind) {
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      const s = isoDate(d);
      return { from: s, to: s, label: "Вчера" };
    }
    case "today": {
      const s = isoDate(now);
      return { from: s, to: s, label: "Сегодня" };
    }
    case "last_7_days": {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: isoDate(from), to: isoDate(now), label: "Последние 7 дней" };
    }
    case "last_week": {
      const thisMon = startOfWeekMon(now);
      const lastSun = new Date(thisMon);
      lastSun.setDate(lastSun.getDate() - 1);
      const lastMon = startOfWeekMon(lastSun);
      return { from: isoDate(lastMon), to: isoDate(lastSun), label: "Прошлая неделя" };
    }
    case "this_week": {
      const mon = startOfWeekMon(now);
      return { from: isoDate(mon), to: isoDate(now), label: "Эта неделя" };
    }
    case "last_month": {
      const firstThis = startOfMonth(now);
      const lastEnd = new Date(firstThis);
      lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfMonth(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd), label: "Прошлый месяц" };
    }
  }
}

// ───────────────────────────────────────────────────────────────────
// CRUD

/**
 * Нормализуем строку из БД (boolean/int для enabled, ISO для дат).
 * Postgres возвращает enabled как boolean, SQLite — как 0/1.
 */
function normalizeRow(r: Record<string, unknown>): ScheduleRow {
  return {
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    name: String(r.name ?? ""),
    scope: (r.scope as ScheduleScope) ?? "team",
    manager_id: (r.manager_id as string | null) ?? null,
    recipient_kind: (r.recipient_kind as ScheduleRecipientKind) ?? "user",
    recipient_id: String(r.recipient_id ?? ""),
    recipient_name: (r.recipient_name as string | null) ?? null,
    frequency: (r.frequency as ScheduleFrequency) ?? "daily",
    time_hhmm: String(r.time_hhmm ?? "09:00"),
    days_of_week: (r.days_of_week as string | null) ?? null,
    period_kind: (r.period_kind as SchedulePeriodKind) ?? "yesterday",
    enabled: typeof r.enabled === "boolean" ? r.enabled : Number(r.enabled) === 1,
    last_run_at: (r.last_run_at as string | null) ?? null,
    last_run_status: (r.last_run_status as string | null) ?? null,
    last_run_error: (r.last_run_error as string | null) ?? null,
    next_run_at: (r.next_run_at as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

/** Конвертация Date → строка для timestamp-колонки (общая для SQLite/PG). */
function toDbTimestamp(d: Date): string {
  // "YYYY-MM-DD HH:MM:SS" — оба драйвера понимают.
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export async function listSchedules(tenantId: number): Promise<ScheduleRow[]> {
  const db = getDbAsync();
  const rows = await db
    .prepare(
      `SELECT id, tenant_id, name, scope, manager_id, recipient_kind, recipient_id,
              recipient_name, frequency, time_hhmm, days_of_week, period_kind,
              enabled, last_run_at, last_run_status, last_run_error, next_run_at,
              created_at, updated_at
         FROM report_schedules
        WHERE tenant_id = ?
        ORDER BY id DESC`
    )
    .all<Record<string, unknown>>(tenantId);
  return rows.map(normalizeRow);
}

export async function getSchedule(id: number, tenantId: number): Promise<ScheduleRow | null> {
  const db = getDbAsync();
  const row = await db
    .prepare(
      `SELECT id, tenant_id, name, scope, manager_id, recipient_kind, recipient_id,
              recipient_name, frequency, time_hhmm, days_of_week, period_kind,
              enabled, last_run_at, last_run_status, last_run_error, next_run_at,
              created_at, updated_at
         FROM report_schedules
        WHERE id = ? AND tenant_id = ? LIMIT 1`
    )
    .get<Record<string, unknown>>(id, tenantId);
  return row ? normalizeRow(row) : null;
}

export async function createSchedule(input: ScheduleInput): Promise<ScheduleRow> {
  const db = getDbAsync();
  const daysJson =
    input.frequency === "weekly" && input.daysOfWeek && input.daysOfWeek.length > 0
      ? JSON.stringify(input.daysOfWeek)
      : null;

  const nextRun = computeNextRunAt(
    { frequency: input.frequency, time_hhmm: input.time, days_of_week: daysJson },
    new Date()
  );

  const enabled = input.enabled === false ? false : true;

  const res = await db
    .prepare(
      `INSERT INTO report_schedules
        (tenant_id, name, scope, manager_id, recipient_kind, recipient_id, recipient_name,
         frequency, time_hhmm, days_of_week, period_kind, enabled, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.tenantId,
      input.name,
      input.scope,
      input.managerId ?? null,
      input.recipientKind,
      input.recipientId,
      input.recipientName ?? null,
      input.frequency,
      input.time,
      daysJson,
      input.periodKind,
      enabled,
      toDbTimestamp(nextRun)
    );

  const id = Number(res.lastInsertRowid ?? 0);
  const created = await getSchedule(id, input.tenantId);
  if (!created) throw new Error("Не удалось создать расписание (запись не найдена после INSERT)");
  return created;
}

export interface SchedulePatch {
  name?: string;
  scope?: ScheduleScope;
  managerId?: string | null;
  recipientKind?: ScheduleRecipientKind;
  recipientId?: string;
  recipientName?: string | null;
  frequency?: ScheduleFrequency;
  time?: string;
  daysOfWeek?: number[] | null;
  periodKind?: SchedulePeriodKind;
  enabled?: boolean;
}

export async function updateSchedule(
  id: number,
  tenantId: number,
  patch: SchedulePatch
): Promise<ScheduleRow | null> {
  const current = await getSchedule(id, tenantId);
  if (!current) return null;

  const merged = {
    name: patch.name ?? current.name,
    scope: patch.scope ?? current.scope,
    manager_id: patch.managerId !== undefined ? (patch.managerId ?? null) : current.manager_id,
    recipient_kind: patch.recipientKind ?? current.recipient_kind,
    recipient_id: patch.recipientId ?? current.recipient_id,
    recipient_name:
      patch.recipientName !== undefined ? (patch.recipientName ?? null) : current.recipient_name,
    frequency: patch.frequency ?? current.frequency,
    time_hhmm: patch.time ?? current.time_hhmm,
    days_of_week:
      patch.daysOfWeek !== undefined
        ? patch.daysOfWeek && patch.daysOfWeek.length > 0
          ? JSON.stringify(patch.daysOfWeek)
          : null
        : current.days_of_week,
    period_kind: patch.periodKind ?? current.period_kind,
    enabled:
      patch.enabled !== undefined ? patch.enabled : (current.enabled ? true : false),
  };

  // Пересчитываем next_run_at если поменялось расписание (freq/time/days) или
  // если расписание включается снова (после выключения старый next_run_at мог устареть).
  const timingChanged =
    patch.frequency !== undefined ||
    patch.time !== undefined ||
    patch.daysOfWeek !== undefined ||
    (patch.enabled === true && current.enabled === false);

  let nextRunSql = "";
  const params: unknown[] = [
    merged.name,
    merged.scope,
    merged.manager_id,
    merged.recipient_kind,
    merged.recipient_id,
    merged.recipient_name,
    merged.frequency,
    merged.time_hhmm,
    merged.days_of_week,
    merged.period_kind,
    merged.enabled,
  ];

  if (timingChanged) {
    const nextRun = computeNextRunAt(
      {
        frequency: merged.frequency,
        time_hhmm: merged.time_hhmm,
        days_of_week: merged.days_of_week,
      },
      new Date()
    );
    nextRunSql = ", next_run_at = ?";
    params.push(toDbTimestamp(nextRun));
  }

  params.push(id, tenantId);

  const db = getDbAsync();
  await db
    .prepare(
      `UPDATE report_schedules
          SET name = ?, scope = ?, manager_id = ?, recipient_kind = ?, recipient_id = ?,
              recipient_name = ?, frequency = ?, time_hhmm = ?, days_of_week = ?,
              period_kind = ?, enabled = ?${nextRunSql},
              updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?`
    )
    .run(...params);

  return getSchedule(id, tenantId);
}

export async function deleteSchedule(id: number, tenantId: number): Promise<void> {
  const db = getDbAsync();
  await db
    .prepare(`DELETE FROM report_schedules WHERE id = ? AND tenant_id = ?`)
    .run(id, tenantId);
}

/**
 * Расписания, которые пора запустить (enabled=true, next_run_at ≤ now).
 * Сортируем по next_run_at ASC чтобы более «просроченные» шли первыми.
 */
export async function getDueSchedules(now: Date = new Date()): Promise<ScheduleRow[]> {
  const db = getDbAsync();
  const rows = await db
    .prepare(
      `SELECT id, tenant_id, name, scope, manager_id, recipient_kind, recipient_id,
              recipient_name, frequency, time_hhmm, days_of_week, period_kind,
              enabled, last_run_at, last_run_status, last_run_error, next_run_at,
              created_at, updated_at
         FROM report_schedules
        WHERE enabled = ?
          AND next_run_at IS NOT NULL
          AND next_run_at <= ?
        ORDER BY next_run_at ASC
        LIMIT 50`
    )
    .all<Record<string, unknown>>(true, toDbTimestamp(now));
  return rows.map(normalizeRow);
}

// ───────────────────────────────────────────────────────────────────
// Исполнение расписания

export interface RunResult {
  ok: boolean;
  error?: string;
  messageId?: number;
  title?: string;
}

/**
 * Сгенерировать и отправить отчёт по расписанию.
 *  1. Считаем период через resolvePeriod()
 *  2. generateReport(scope/managerId)
 *  3. imSendMessage(recipient_id) — работает и для user_id, и для "chatN"
 *  4. UPDATE last_run_*, next_run_at
 */
export async function runScheduled(s: ScheduleRow): Promise<RunResult> {
  const period = resolvePeriod(s.period_kind);
  let result: RunResult;
  let title: string | undefined;

  try {
    const report = await generateReport({
      tenantId: s.tenant_id,
      scope: s.scope,
      managerId: s.manager_id ?? undefined,
      from: period.from,
      to: period.to,
      periodLabel: period.label,
    });
    title = report.title;

    const send = await imSendMessage(s.recipient_id, report.text, s.tenant_id);
    if (send.ok) {
      result = { ok: true, messageId: send.messageId, title };
    } else {
      result = { ok: false, error: send.error || "Bitrix не принял сообщение", title };
    }
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e), title };
  }

  // Обновляем итоги выполнения и считаем next_run_at от now (не от прошлого
  // запуска), чтобы расписание не «спамило» если воркер пропустил несколько тиков.
  const now = new Date();
  const nextRun = computeNextRunAt(
    { frequency: s.frequency, time_hhmm: s.time_hhmm, days_of_week: s.days_of_week },
    now
  );

  try {
    const db = getDbAsync();
    await db
      .prepare(
        `UPDATE report_schedules
            SET last_run_at = ?,
                last_run_status = ?,
                last_run_error = ?,
                next_run_at = ?,
                updated_at = datetime('now')
          WHERE id = ?`
      )
      .run(
        toDbTimestamp(now),
        result.ok ? "ok" : "failed",
        result.ok ? null : result.error ?? null,
        toDbTimestamp(nextRun),
        s.id
      );
  } catch (e) {
    console.warn("[reports-scheduler] failed to update last_run:", (e as Error).message);
  }

  return result;
}
