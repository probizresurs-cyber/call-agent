/**
 * Row-Level Security helpers — собирают WHERE-фильтры для запросов
 * на calls/analyses в зависимости от роли пользователя.
 *
 * Принцип:
 *  - owner / admin / head — видят все звонки своего тенанта
 *  - manager — видит только звонки где manager_id == свой bitrix_manager_id
 *
 * Возвращает { sql, params } для подстановки в .prepare(`... WHERE ${sql}`).all(...params)
 */
import type { SessionUser } from "./auth";

export interface RlsFilter {
  sql: string;
  params: unknown[];
}

/**
 * Базовый фильтр: tenant_id всегда обязателен; для manager — дополнительно manager_id.
 * Использовать в SQL: `... WHERE c.tenant_id = ? [AND c.manager_id = ?]`
 *
 * Префикс таблицы передаётся (по умолчанию 'c' — для calls).
 */
export function rlsFor(user: SessionUser, opts: { table?: string } = {}): RlsFilter {
  const t = opts.table ?? "c";
  const parts: string[] = [`${t}.tenant_id = ?`];
  const params: unknown[] = [user.tenantId];

  if (user.role === "manager") {
    if (!user.bitrixManagerId) {
      // Менеджер без привязки к Bitrix-ID не видит ни одного звонка
      parts.push("1 = 0");
    } else {
      parts.push(`${t}.manager_id = ?`);
      params.push(user.bitrixManagerId);
    }
  }

  return { sql: parts.join(" AND "), params };
}

/** Удобная обёртка — складывает rls с дополнительными условиями */
export function rlsAndWhere(
  user: SessionUser,
  extra: { sql: string[]; params: unknown[] },
  opts: { table?: string } = {}
): { whereSql: string; params: unknown[] } {
  const rls = rlsFor(user, opts);
  const allParts = [rls.sql, ...extra.sql];
  const allParams = [...rls.params, ...extra.params];
  return {
    whereSql: "WHERE " + allParts.join(" AND "),
    params: allParams,
  };
}
