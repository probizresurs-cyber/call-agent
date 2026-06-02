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
 * Per-tenant DRY_RUN.
 * Приоритет: tenants.settings.dry_run (если задан) → ENV DRY_RUN (fallback).
 */
export async function isDryRunForTenant(tenantId: number): Promise<boolean> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const s = parseSettings(row?.settings);
  if (s && typeof s.dry_run === "boolean") return s.dry_run;
  // Fallback на ENV
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
 * Установить per-tenant DRY_RUN.
 * Сохраняется в tenants.settings.dry_run (json колонка).
 */
export async function setDryRunForTenant(tenantId: number, value: boolean): Promise<void> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const current = parseSettings(row?.settings) ?? {};
  const next = { ...current, dry_run: value };
  // PG jsonb принимает string; SQLite — TEXT. JSON.stringify работает для обеих БД через adapter.
  await db
    .prepare(`UPDATE tenants SET settings = ? WHERE id = ?`)
    .run(JSON.stringify(next), tenantId);
}

/** Сводка флагов для отображения в /settings или дебаге. */
export interface FlagsSummary {
  standalone: boolean;
  dryRunGlobal: boolean;
  dryRunForTenant: boolean;
}

export async function getFlagsSummary(tenantId: number): Promise<FlagsSummary> {
  return {
    standalone: isStandalone(),
    dryRunGlobal: isDryRunGlobal(),
    dryRunForTenant: await isDryRunForTenant(tenantId),
  };
}
