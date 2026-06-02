/**
 * §4.4 MASTER-TZ — бюджет-гард на тенанта.
 *
 * Лимиты задаются в tenants.settings:
 *   - max_anthropic_tokens_per_month: number | null  (input+output tokens)
 *   - max_openai_seconds_per_month:   number | null  (секунды Whisper аудио)
 *   - budget_action: 'stop' | 'notify_only'          (поведение при достижении)
 *
 * Учёт ведём в таблице usage_events (создаётся ленивым CREATE TABLE IF NOT EXISTS
 * на старте — чтобы не требовать отдельной миграции).
 *
 * Поведение:
 *   - перед каждым LLM/ASR вызовом checkBudget(tenantId, kind)
 *   - если 'stop' и лимит превышен → throw BudgetExceededError → worker помечает status='budget_exceeded'
 *   - если 'notify_only' и лимит превышен → один раз/период шлём уведомление, запрос пропускаем
 *   - после вызова recordUsage(...) добавляет строку в usage_events
 */
import { getDbAsync } from "./db-compat";

export type UsageKind = "anthropic_tokens" | "openai_seconds";
export type BudgetAction = "stop" | "notify_only";

export class BudgetExceededError extends Error {
  constructor(public kind: UsageKind, public limit: number, public used: number) {
    super(`Budget exceeded for ${kind}: used ${used}, limit ${limit}`);
    this.name = "BudgetExceededError";
  }
}

export interface TenantBudget {
  maxAnthropicTokens: number | null;
  maxOpenaiSeconds: number | null;
  action: BudgetAction;
}

export interface UsageSummary {
  anthropicTokens: number;
  openaiSeconds: number;
  periodStart: string;  // YYYY-MM-01
}

/**
 * Лениво создаёт таблицу usage_events. Идемпотентно для обеих БД.
 * Вызывается на первое обращение из любой budget-функции.
 */
let _tableReady = false;
async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  const db = getDbAsync();
  // Используем общий SQL который понимают обе БД.
  // BIGINT/INTEGER в SQLite приводится к INTEGER, в PG — к bigint.
  // TIMESTAMP в SQLite даёт TEXT, в PG — timestamp; для нашего use case достаточно текстового хранения.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      kind VARCHAR(32) NOT NULL,
      units INTEGER NOT NULL,
      call_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS usage_tenant_kind_at_idx ON usage_events(tenant_id, kind, created_at);
  `).catch(async () => {
    // SQLite не любит SERIAL/NOW()/TIMESTAMP — fallback с SQLite-синтаксисом.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        kind TEXT NOT NULL,
        units INTEGER NOT NULL,
        call_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS usage_tenant_kind_at_idx ON usage_events(tenant_id, kind, created_at);
    `);
  });
  _tableReady = true;
}

/** Прочитать бюджетные настройки тенанта. */
export async function getTenantBudget(tenantId: number): Promise<TenantBudget> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const s = parseSettings(row?.settings);
  return {
    maxAnthropicTokens: numOrNull(s?.max_anthropic_tokens_per_month),
    maxOpenaiSeconds:   numOrNull(s?.max_openai_seconds_per_month),
    action: (s?.budget_action === "notify_only" ? "notify_only" : "stop") as BudgetAction,
  };
}

/** Установить бюджетные настройки тенанта (merge в settings). */
export async function setTenantBudget(tenantId: number, b: Partial<TenantBudget>): Promise<void> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const current = parseSettings(row?.settings) ?? {};
  const next: Record<string, unknown> = { ...current };
  if (b.maxAnthropicTokens !== undefined) next.max_anthropic_tokens_per_month = b.maxAnthropicTokens;
  if (b.maxOpenaiSeconds   !== undefined) next.max_openai_seconds_per_month   = b.maxOpenaiSeconds;
  if (b.action             !== undefined) next.budget_action                   = b.action;
  await db
    .prepare(`UPDATE tenants SET settings = ? WHERE id = ?`)
    .run(JSON.stringify(next), tenantId);
}

/** Накопленный расход за текущий календарный месяц. */
export async function getMonthlyUsage(tenantId: number): Promise<UsageSummary> {
  await ensureTable();
  const db = getDbAsync();
  // Первое число текущего месяца как граница (UTC)
  const now = new Date();
  const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const rows = await db
    .prepare(
      `SELECT kind, SUM(units) AS total
       FROM usage_events
       WHERE tenant_id = ? AND created_at >= ?
       GROUP BY kind`
    )
    .all<{ kind: string; total: number }>(tenantId, periodStart);

  const map: Record<string, number> = {};
  for (const r of rows) map[r.kind] = Number(r.total ?? 0);

  return {
    anthropicTokens: map["anthropic_tokens"] ?? 0,
    openaiSeconds:   map["openai_seconds"] ?? 0,
    periodStart,
  };
}

/**
 * Проверка бюджета ПЕРЕД дорогим вызовом.
 * Если 'stop' и текущий расход уже превышает лимит — бросает BudgetExceededError.
 * 'notify_only' — не бросает, только возвращает превышение в результат.
 */
export async function checkBudget(tenantId: number, kind: UsageKind): Promise<{ allowed: boolean; reason?: string }> {
  const [budget, usage] = await Promise.all([getTenantBudget(tenantId), getMonthlyUsage(tenantId)]);
  const limit =
    kind === "anthropic_tokens" ? budget.maxAnthropicTokens :
    kind === "openai_seconds"   ? budget.maxOpenaiSeconds   : null;
  if (limit == null || limit <= 0) return { allowed: true }; // лимит не задан = без ограничения

  const used =
    kind === "anthropic_tokens" ? usage.anthropicTokens :
    kind === "openai_seconds"   ? usage.openaiSeconds   : 0;

  if (used >= limit) {
    if (budget.action === "stop") {
      throw new BudgetExceededError(kind, limit, used);
    }
    return { allowed: false, reason: `${kind}: used ${used} / limit ${limit}` };
  }
  return { allowed: true };
}

/** Записать расход в usage_events. Не падает если БД временно недоступна — просто логирует. */
export async function recordUsage(
  tenantId: number,
  kind: UsageKind,
  units: number,
  callId?: number
): Promise<void> {
  if (!units || units <= 0) return;
  try {
    await ensureTable();
    const db = getDbAsync();
    await db
      .prepare(`INSERT INTO usage_events (tenant_id, kind, units, call_id) VALUES (?, ?, ?, ?)`)
      .run(tenantId, kind, Math.round(units), callId ?? null);
  } catch (e) {
    console.warn(`[budget] recordUsage failed (${kind}, ${units}):`, (e as Error).message);
  }
}

// ── helpers ──

function parseSettings(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}
