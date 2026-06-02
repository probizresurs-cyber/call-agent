/**
 * §5.3 MASTER-TZ — движок напоминаний.
 *
 * Источники reminder'ов:
 *   1. Авто-парсинг analysis.next_action: «перезвонить через 3 дня», «отправить КП завтра», «в среду»
 *   2. Ручное создание из карточки звонка (TODO в будущей итерации)
 *
 * Таблица reminders создаётся лениво (CREATE TABLE IF NOT EXISTS), без отдельной миграции.
 *
 * Доставка по каналам web-push / email / Telegram-бот — отдельные итерации.
 * Сейчас только хранение + UI в /my.
 */
import { getDbAsync } from "./db-compat";

export type ReminderStatus = "pending" | "completed" | "snoozed" | "dismissed";

export interface Reminder {
  id: number;
  tenant_id: number;
  user_id: number | null;        // если null — на менеджера по bitrix_manager_id
  bitrix_manager_id: string | null;
  call_id: number | null;
  title: string;
  due_at: string;                 // ISO timestamp
  status: ReminderStatus;
  source: string;                 // 'auto' / 'manual'
  created_at: string;
  completed_at: string | null;
}

let _tableReady = false;
async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  const db = getDbAsync();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reminders_auto (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      user_id INTEGER,
      bitrix_manager_id VARCHAR(64),
      call_id INTEGER,
      title TEXT NOT NULL,
      due_at TIMESTAMP NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      source VARCHAR(16) NOT NULL DEFAULT 'auto',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS rem_user_status_idx ON reminders_auto(bitrix_manager_id, status, due_at);
    CREATE INDEX IF NOT EXISTS rem_due_idx ON reminders_auto(due_at, status);
    CREATE INDEX IF NOT EXISTS rem_call_idx ON reminders_auto(call_id);
  `).catch(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS reminders_auto (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        user_id INTEGER,
        bitrix_manager_id TEXT,
        call_id INTEGER,
        title TEXT NOT NULL,
        due_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        source TEXT NOT NULL DEFAULT 'auto',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS rem_user_status_idx ON reminders_auto(bitrix_manager_id, status, due_at);
      CREATE INDEX IF NOT EXISTS rem_due_idx ON reminders_auto(due_at, status);
      CREATE INDEX IF NOT EXISTS rem_call_idx ON reminders_auto(call_id);
    `);
  });
  _tableReady = true;
}

/**
 * Парсит фразы из analysis.next_action и возвращает дату когда напомнить.
 * Поддерживает:
 *   - «через 3 дня», «через час», «через 2 недели»
 *   - «завтра», «послезавтра», «сегодня»
 *   - «в понедельник», «в среду», «в пятницу»
 *   - «через неделю»
 * Если не распознано — null (напоминание не создаётся).
 */
export function parseDueDate(nextAction: string, baseDate: Date = new Date()): Date | null {
  if (!nextAction) return null;
  const t = nextAction.toLowerCase();
  const base = new Date(baseDate);

  // «через N единиц»
  const m1 = t.match(/через\s+(\d+)\s+(минут|час|часа|часов|день|дня|дней|недел[яиью])/);
  if (m1) {
    const n = parseInt(m1[1], 10);
    const unit = m1[2];
    if (/минут/.test(unit)) base.setMinutes(base.getMinutes() + n);
    else if (/час/.test(unit)) base.setHours(base.getHours() + n);
    else if (/день|дня|дней/.test(unit)) base.setDate(base.getDate() + n);
    else if (/недел/.test(unit)) base.setDate(base.getDate() + n * 7);
    return base;
  }

  if (/через\s+час/.test(t)) { base.setHours(base.getHours() + 1); return base; }
  if (/через\s+полчаса/.test(t)) { base.setMinutes(base.getMinutes() + 30); return base; }
  if (/через\s+день/.test(t)) { base.setDate(base.getDate() + 1); return base; }
  if (/через\s+недел/.test(t)) { base.setDate(base.getDate() + 7); return base; }

  if (/завтра/.test(t)) { base.setDate(base.getDate() + 1); base.setHours(10, 0, 0, 0); return base; }
  if (/послезавтра/.test(t)) { base.setDate(base.getDate() + 2); base.setHours(10, 0, 0, 0); return base; }

  // «в N-й день недели»
  const weekdays: Record<string, number> = {
    "понедельник": 1, "вторник": 2, "сред": 3, "четверг": 4, "пятниц": 5, "суббот": 6, "воскресен": 0,
  };
  for (const [name, idx] of Object.entries(weekdays)) {
    if (t.includes(`в ${name}`) || t.includes(`во ${name}`)) {
      const today = base.getDay();
      let diff = idx - today;
      if (diff <= 0) diff += 7;
      base.setDate(base.getDate() + diff);
      base.setHours(10, 0, 0, 0);
      return base;
    }
  }

  return null;
}

/**
 * Создаёт reminder из анализа звонка. Идемпотентно — если для этого call уже есть pending reminder,
 * не дублируем.
 */
export async function createReminderFromAnalysis(args: {
  tenantId: number;
  callId: number;
  bitrixManagerId: string | null;
  nextAction: string;
  clientName: string | null;
  clientPhone: string | null;
}): Promise<number | null> {
  if (!args.bitrixManagerId || !args.nextAction) return null;
  const dueAt = parseDueDate(args.nextAction);
  if (!dueAt) return null;

  await ensureTable();
  const db = getDbAsync();

  // Дедуп: уже есть pending reminder для этого call?
  const existing = await db
    .prepare(`SELECT id FROM reminders_auto WHERE call_id = ? AND status = 'pending' LIMIT 1`)
    .get<{ id: number }>(args.callId);
  if (existing) return null;

  const who = args.clientName || args.clientPhone || "клиентом";
  const title = `${truncate(args.nextAction, 80)} (с ${who})`;
  const dueAtStr = dueAt.toISOString().replace("T", " ").slice(0, 19);

  const r = await db
    .prepare(
      `INSERT INTO reminders_auto (tenant_id, bitrix_manager_id, call_id, title, due_at, status, source)
       VALUES (?, ?, ?, ?, ?, 'pending', 'auto')`
    )
    .run(args.tenantId, args.bitrixManagerId, args.callId, title, dueAtStr);
  return r.lastInsertRowid as number | undefined ?? null;
}

export async function listReminders(opts: {
  tenantId: number;
  bitrixManagerId?: string | null;
  status?: ReminderStatus;
  limit?: number;
}): Promise<Reminder[]> {
  await ensureTable();
  const db = getDbAsync();
  const where: string[] = ["tenant_id = ?"];
  const params: unknown[] = [opts.tenantId];
  if (opts.bitrixManagerId) {
    where.push("bitrix_manager_id = ?");
    params.push(opts.bitrixManagerId);
  }
  if (opts.status) {
    where.push("status = ?");
    params.push(opts.status);
  }
  return await db
    .prepare(
      `SELECT * FROM reminders_auto
       WHERE ${where.join(" AND ")}
       ORDER BY due_at ASC
       LIMIT ?`
    )
    .all<Reminder>(...params, opts.limit ?? 50);
}

export async function markReminderDone(id: number, tenantId: number): Promise<void> {
  await ensureTable();
  const db = getDbAsync();
  await db
    .prepare(`UPDATE reminders_auto SET status='completed', completed_at=datetime('now') WHERE id=? AND tenant_id=?`)
    .run(id, tenantId);
}

export async function snoozeReminder(id: number, tenantId: number, hours: number): Promise<void> {
  await ensureTable();
  const db = getDbAsync();
  const due = new Date();
  due.setHours(due.getHours() + hours);
  const dueStr = due.toISOString().replace("T", " ").slice(0, 19);
  await db
    .prepare(`UPDATE reminders_auto SET status='snoozed', due_at=? WHERE id=? AND tenant_id=?`)
    .run(dueStr, id, tenantId);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
