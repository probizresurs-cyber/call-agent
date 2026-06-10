/**
 * Централизованное чтение системных флагов (§9, §10 MASTER-TZ).
 *
 * STANDALONE — режим работы:
 *   true  — собственная инсталляция со своим логином (текущий режим)
 *   false — встроенный в Company24 Core (SSO, скрытый локальный вход)
 *   Source: ENV
 *
 * DRY_RUN — предохранитель для CRM-write и других "уходящих" интеграций:
 *   true  — операции формируются и логируются, но не отправляются наружу
 *   false — отправляются по-настоящему
 *   Source: ENV (по умолчанию) + per-tenant override в tenants.settings.dry_run
 *
 * Принцип: всегда передавать tenantId если он известен — даст per-tenant
 * значение DRY_RUN. Без tenantId — глобальный fallback из ENV.
 */
import { getDbAsync } from "./db-compat";

export function isStandalone(): boolean {
  // По умолчанию true — текущий режим прод-инсталляции.
  // Когда появится Core, переключаем ENV без правок кода.
  const v = process.env.STANDALONE?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off") return false;
  return true;
}

/**
 * Глобальный DRY_RUN из ENV.
 * Используется когда per-tenant контекст недоступен (например при онбординге).
 * По умолчанию true (безопасный режим) — чтобы случайно не отправить продакшен-данные в внешний сервис.
 */
export function isDryRunGlobal(): boolean {
  const v = process.env.DRY_RUN?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off") return false;
  return true;
}

/**
 * Per-tenant DRY_RUN — независимые рубильники для двух классов «уходящих» интеграций:
 *
 *   kind="crm"      — запись комментариев в timeline сделок/лидов Bitrix (pipeline.ts,
 *                     bitrix-write.ts). Самая опасная — пишет в чужую CRM. Default-on
 *                     до явного включения, чтобы не засорять прод-сделки тестовыми
 *                     комментариями.
 *   kind="messages" — отправка отчётов через бота в мессенджер Bitrix (bitrix-im.ts).
 *                     Безопаснее CRM-write — никаких чужих записей не создаёт, только
 *                     личное сообщение/чат. Можно включать раньше.
 *
 * Приоритет (по убыванию):
 *   1. tenants.settings.dry_run_<kind>  (per-tenant, per-kind override)
 *   2. tenants.settings.dry_run         (per-tenant общий — legacy, оба класса разом)
 *   3. ENV DRY_RUN                       (глобальный fallback)
 *
 * Default kind="crm" — обратная совместимость со старыми вызовами без аргумента.
 */
export type DryRunKind = "crm" | "messages";

export async function isDryRunForTenant(
  tenantId: number,
  kind: DryRunKind = "crm"
): Promise<boolean> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const s = parseSettings(row?.settings);
  if (s) {
    // 1. Per-kind override — самый точный
    const perKindKey = `dry_run_${kind}` as const;
    const perKind = s[perKindKey];
    if (typeof perKind === "boolean") return perKind;
    // 2. Legacy общий per-tenant флаг — оба класса разом
    if (typeof s.dry_run === "boolean") return s.dry_run;
  }
  // 3. Глобальный ENV fallback
  return isDryRunGlobal();
}

/**
 * tenants.settings приходит как объект (PG jsonb auto-parsed) или строка JSON (SQLite TEXT).
 * Нормализуем к Record<string, unknown> либо null.
 */
function parseSettings(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  }
  return null;
}

/**
 * Установить per-tenant DRY_RUN для конкретного класса операций.
 * Сохраняется в tenants.settings.dry_run_<kind>. Legacy ключ `dry_run` НЕ трогаем —
 * пусть остаётся как fallback, но per-kind теперь главнее (см. isDryRunForTenant).
 *
 * Без kind — пишет legacy `dry_run` (обратная совместимость для старого UI).
 */
export async function setDryRunForTenant(
  tenantId: number,
  value: boolean,
  kind?: DryRunKind
): Promise<void> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const current = parseSettings(row?.settings) ?? {};
  const key = kind ? `dry_run_${kind}` : "dry_run";
  const next = { ...current, [key]: value };
  // PG jsonb принимает string; SQLite — TEXT. JSON.stringify работает для обеих БД через adapter.
  await db
    .prepare(`UPDATE tenants SET settings = ? WHERE id = ?`)
    .run(JSON.stringify(next), tenantId);
}

/** Сводка флагов для отображения в /settings или дебаге. */
export interface FlagsSummary {
  standalone: boolean;
  dryRunGlobal: boolean;
  /** Legacy общий per-tenant флаг — оставлен для обратной совместимости. */
  dryRunForTenant: boolean;
  /** Per-kind, актуальные значения с учётом всей цепочки fallback. */
  dryRunCrm: boolean;
  dryRunMessages: boolean;
}

export async function getFlagsSummary(tenantId: number): Promise<FlagsSummary> {
  return {
    standalone: isStandalone(),
    dryRunGlobal: isDryRunGlobal(),
    dryRunForTenant: await isDryRunForTenant(tenantId),
    dryRunCrm: await isDryRunForTenant(tenantId, "crm"),
    dryRunMessages: await isDryRunForTenant(tenantId, "messages"),
  };
}
