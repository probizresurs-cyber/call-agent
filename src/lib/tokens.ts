/**
 * Токены Call-Agent — единая валюта баланса аккаунта (тенанта).
 * Баланс = SUM(delta) по ca_token_ledger. Начисления: тариф (plan_grant),
 * пополнение (topup), бонус промокода (promo_bonus), ручная правка (manual/adjust).
 * Списание: 1 токен за разобранный звонок (reason='call', delta=-1).
 *
 * Модель «журнал» (а не поле-баланс) даёт честную историю и сводку за период
 * без риска рассинхрона.
 */
import { getDbAsync } from "./db-compat";

export type TokenReason = "plan_grant" | "topup" | "promo_bonus" | "call" | "manual" | "adjust";

export interface LedgerRow {
  id: number;
  tenant_id: number;
  delta: number;
  reason: TokenReason;
  ref_call_id: number | null;
  note: string | null;
  created_at: string;
}

/** Текущий баланс тенанта. */
export async function getBalance(tenantId: number): Promise<number> {
  const r = await getDbAsync()
    .prepare("SELECT COALESCE(SUM(delta),0) AS bal FROM ca_token_ledger WHERE tenant_id = ?")
    .get<{ bal: number }>(tenantId);
  return Number(r?.bal ?? 0);
}

/** Балансы всех тенантов (для админ-листа). */
export async function getAllBalances(): Promise<Array<{ tenant_id: number; name: string; balance: number; is_active: boolean }>> {
  const rows = await getDbAsync()
    .prepare(
      `SELECT t.id AS tenant_id, t.name, t.is_active,
              COALESCE(SUM(l.delta),0) AS balance
       FROM tenants t
       LEFT JOIN ca_token_ledger l ON l.tenant_id = t.id
       GROUP BY t.id, t.name, t.is_active
       ORDER BY t.id`
    )
    .all<{ tenant_id: number; name: string; is_active: boolean | number; balance: number }>();
  return rows.map((r) => ({ tenant_id: r.tenant_id, name: r.name, balance: Number(r.balance), is_active: !!r.is_active }));
}

/** Начисление/списание. delta>0 — начисление, delta<0 — списание. */
export async function addTokens(
  tenantId: number,
  delta: number,
  reason: TokenReason,
  opts: { note?: string; refCallId?: number } = {}
): Promise<void> {
  if (!Number.isFinite(delta) || delta === 0) return;
  await getDbAsync()
    .prepare(
      `INSERT INTO ca_token_ledger (tenant_id, delta, reason, ref_call_id, note)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(tenantId, Math.trunc(delta), reason, opts.refCallId ?? null, opts.note ?? null);
}

/** Списать N токенов за звонок (по умолчанию 1). Идемпотентно по ref_call_id. */
export async function spendForCall(tenantId: number, callId: number, amount = 1): Promise<void> {
  const db = getDbAsync();
  const already = await db
    .prepare("SELECT 1 AS x FROM ca_token_ledger WHERE tenant_id = ? AND reason = 'call' AND ref_call_id = ? LIMIT 1")
    .get<{ x: number }>(tenantId, callId);
  if (already) return; // уже списано за этот звонок — не дублируем при ретрае
  await addTokens(tenantId, -Math.abs(amount), "call", { refCallId: callId, note: `Разбор звонка #${callId}` });
}

/** История операций за период (или последние N). */
export async function getLedger(
  tenantId: number,
  opts: { from?: string; to?: string; limit?: number } = {}
): Promise<LedgerRow[]> {
  const limit = Math.min(opts.limit ?? 200, 1000);
  const clauses = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (opts.from) { clauses.push("created_at >= ?"); params.push(opts.from); }
  if (opts.to) { clauses.push("created_at <= ?"); params.push(opts.to); }
  params.push(limit);
  return getDbAsync()
    .prepare(
      `SELECT id, tenant_id, delta, reason, ref_call_id, note, created_at
       FROM ca_token_ledger WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all<LedgerRow>(...params);
}

/** Сводка за период: начислено/списано по причинам + итог. */
export async function getPeriodSummary(
  tenantId: number,
  from?: string,
  to?: string
): Promise<{ granted: number; topup: number; promo: number; spent: number; net: number; byReason: Record<string, number> }> {
  const clauses = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (from) { clauses.push("created_at >= ?"); params.push(from); }
  if (to) { clauses.push("created_at <= ?"); params.push(to); }
  const rows = await getDbAsync()
    .prepare(`SELECT reason, COALESCE(SUM(delta),0) AS s FROM ca_token_ledger WHERE ${clauses.join(" AND ")} GROUP BY reason`)
    .all<{ reason: string; s: number }>(...params);
  const byReason: Record<string, number> = {};
  for (const r of rows) byReason[r.reason] = Number(r.s);
  const granted = byReason.plan_grant ?? 0;
  const topup = byReason.topup ?? 0;
  const promo = byReason.promo_bonus ?? 0;
  const spent = -(byReason.call ?? 0); // списания отрицательны — показываем как положительное «потрачено»
  const net = Object.values(byReason).reduce((a, b) => a + b, 0);
  return { granted, topup, promo, spent, net, byReason };
}

/**
 * Применить промокод к тенанту: начислить bonus_tokens, если промо активен,
 * не истёк и не исчерпан. Возвращает {ok, bonus, error}.
 */
export async function applyPromoTokens(tenantId: number, code: string): Promise<{ ok: boolean; bonus?: number; error?: string }> {
  const db = getDbAsync();
  const p = await db
    .prepare(
      `SELECT id, bonus_tokens, active, max_uses, uses_count, expires_at
       FROM ca_promos WHERE lower(code) = lower(?) LIMIT 1`
    )
    .get<{ id: number; bonus_tokens: number | null; active: number | boolean; max_uses: number | null; uses_count: number; expires_at: string | null }>(code.trim());
  if (!p) return { ok: false, error: "Промокод не найден" };
  if (!p.active) return { ok: false, error: "Промокод неактивен" };
  if (p.expires_at && new Date(p.expires_at) < new Date()) return { ok: false, error: "Промокод истёк" };
  if (p.max_uses != null && p.uses_count >= p.max_uses) return { ok: false, error: "Лимит использований исчерпан" };
  const bonus = Number(p.bonus_tokens ?? 0);
  if (bonus <= 0) return { ok: false, error: "У промокода нет бонус-токенов" };
  await addTokens(tenantId, bonus, "promo_bonus", { note: `Промокод ${code.trim()}` });
  await db.prepare("UPDATE ca_promos SET uses_count = uses_count + 1 WHERE id = ?").run(p.id);
  return { ok: true, bonus };
}

// ─────────── Настройки биллинга (enforcement) + статус ───────────

export interface TokenSettings {
  /** Жёсткий блок обработки при нулевом/отрицательном балансе (по умолчанию ВЫКЛ). */
  enforce: boolean;
  /** Порог «низкого баланса» для предупреждения (по умолчанию 50). */
  lowThreshold: number;
  /** Дата конца оплаченного периода (YYYY-MM-DD) — для напоминаний. null = не задан. */
  periodEnd: string | null;
  /** Слать клиенту уведомления о балансе/конце периода (email + платформа). */
  notifyEnabled: boolean;
  /** Явный список email получателей; пусто → авто (админы/владельцы клиента). */
  notifyEmails: string[];
}

/** За сколько дней до конца периода напоминать (решение Юрия). */
export const REMINDER_DAYS_BEFORE = [7, 5, 3, 2, 1];

const DEFAULT_SETTINGS: TokenSettings = {
  enforce: false, lowThreshold: 50, periodEnd: null, notifyEnabled: false, notifyEmails: [],
};

function parseSettings(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } }
  return {};
}

/** Настройки токен-биллинга тенанта (хранятся в tenants.settings.token_billing). */
export async function getTokenSettings(tenantId: number): Promise<TokenSettings> {
  const row = await getDbAsync()
    .prepare("SELECT settings FROM tenants WHERE id = ?")
    .get<{ settings: unknown }>(tenantId);
  const s = parseSettings(row?.settings);
  const tb = parseSettings(s.token_billing);
  return {
    enforce: tb.enforce === true,
    lowThreshold: Number.isFinite(Number(tb.lowThreshold)) ? Number(tb.lowThreshold) : DEFAULT_SETTINGS.lowThreshold,
    periodEnd: typeof tb.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tb.periodEnd) ? tb.periodEnd : null,
    notifyEnabled: tb.notifyEnabled === true,
    notifyEmails: Array.isArray(tb.notifyEmails) ? (tb.notifyEmails as unknown[]).filter((x) => typeof x === "string") as string[] : [],
  };
}

/** Обновить настройки токен-биллинга (merge в tenants.settings.token_billing). */
export async function setTokenSettings(tenantId: number, patch: Partial<TokenSettings>): Promise<TokenSettings> {
  const db = getDbAsync();
  const row = await db.prepare("SELECT settings FROM tenants WHERE id = ?").get<{ settings: unknown }>(tenantId);
  const s = parseSettings(row?.settings);
  const cur = { ...DEFAULT_SETTINGS, ...parseSettings(s.token_billing) } as TokenSettings;
  const next: TokenSettings = {
    enforce: patch.enforce != null ? !!patch.enforce : cur.enforce,
    lowThreshold: patch.lowThreshold != null && Number.isFinite(Number(patch.lowThreshold))
      ? Math.max(0, Math.trunc(Number(patch.lowThreshold))) : cur.lowThreshold,
    periodEnd: patch.periodEnd !== undefined
      ? (typeof patch.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(patch.periodEnd) ? patch.periodEnd : null)
      : (cur.periodEnd ?? null),
    notifyEnabled: patch.notifyEnabled != null ? !!patch.notifyEnabled : (cur.notifyEnabled ?? false),
    notifyEmails: patch.notifyEmails !== undefined
      ? (Array.isArray(patch.notifyEmails) ? patch.notifyEmails.filter((x) => typeof x === "string" && x.includes("@")).slice(0, 20) : [])
      : (cur.notifyEmails ?? []),
  };
  s.token_billing = next;
  await db.prepare("UPDATE tenants SET settings = ? WHERE id = ?").run(JSON.stringify(s), tenantId);
  return next;
}

export interface BillingStatus {
  balance: number;
  enforce: boolean;
  lowThreshold: number;
  /** Баланс на исходе (≤ порога) — показать предупреждение. */
  low: boolean;
  /** Обработка заблокирована (enforce включён И баланс ≤ 0). */
  blocked: boolean;
  /** Дата конца периода (YYYY-MM-DD) или null. */
  periodEnd: string | null;
  /** Дней до конца периода (>=0) или null; для баннера «период заканчивается». */
  daysUntilPeriodEnd: number | null;
}

/** Полный статус биллинга тенанта (для гарда pipeline и баннера портала). */
export async function getBillingStatus(tenantId: number): Promise<BillingStatus> {
  const [balance, settings] = await Promise.all([getBalance(tenantId), getTokenSettings(tenantId)]);
  let daysUntilPeriodEnd: number | null = null;
  if (settings.periodEnd) {
    const today = new Date().toISOString().slice(0, 10);
    const a = new Date(today + "T00:00:00Z").getTime();
    const b = new Date(settings.periodEnd + "T00:00:00Z").getTime();
    daysUntilPeriodEnd = Math.round((b - a) / 86400000);
  }
  return {
    balance,
    enforce: settings.enforce,
    lowThreshold: settings.lowThreshold,
    low: balance <= settings.lowThreshold,
    blocked: settings.enforce && balance <= 0,
    periodEnd: settings.periodEnd,
    daysUntilPeriodEnd,
  };
}

// ─────────── Тарифы: список и начисление токенов тарифа ───────────

export interface PlanRow { id: number; name: string; tokens_included: number | null; price_monthly: number }

/** Активные тарифы (для выбора при начислении токенов). */
export async function listPlans(): Promise<PlanRow[]> {
  return getDbAsync()
    .prepare("SELECT id, name, tokens_included, price_monthly FROM ca_plans WHERE active IS NOT FALSE ORDER BY price_monthly")
    .all<PlanRow>();
}

/**
 * Начислить тенанту токены тарифа (tokens_included). Прагматичная замена
 * авто-начислению по подписке — связи тенант→тариф пока нет, поэтому тариф
 * выбирается вручную (кнопка в админке). Причина в журнале — plan_grant.
 */
export async function grantPlanTokens(tenantId: number, planId: number): Promise<{ ok: boolean; granted?: number; error?: string }> {
  const plan = await getDbAsync()
    .prepare("SELECT id, name, tokens_included FROM ca_plans WHERE id = ?")
    .get<{ id: number; name: string; tokens_included: number | null }>(planId);
  if (!plan) return { ok: false, error: "Тариф не найден" };
  const amount = Number(plan.tokens_included ?? 0);
  if (amount <= 0) return { ok: false, error: `У тарифа «${plan.name}» не задано число токенов` };
  await addTokens(tenantId, amount, "plan_grant", { note: `Токены тарифа «${plan.name}»` });
  return { ok: true, granted: amount };
}
