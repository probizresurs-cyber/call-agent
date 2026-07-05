import { getDbAsync } from "@/lib/db-compat";
import { usersGetBatch, formatUserName } from "./bitrix";

/**
 * Обновляет таблицу managers + проставляет manager_name в calls
 * для всех уникальных manager_id у которых имя ещё не известно.
 *
 * Вызывается:
 *  - после успешного импорта (для новых звонков)
 *  - можно дёрнуть вручную через /api/managers/backfill
 *
 * opts.tenantId — если передан, ВСЕ запросы скоупятся по этому тенанту
 *   (используется user-facing роутами: manager/backfill, reattribute).
 *   Без tenantId сохраняется старое глобальное поведение — так вызывает
 *   системный importer (по всем тенантам сразу).
 */
export async function backfillManagerNames(opts?: { forceAll?: boolean; tenantId?: number }): Promise<{
  uniqueIds: number;
  fetched: number;
  updatedCalls: number;
}> {
  const db = getDbAsync();
  const tid = opts?.tenantId;
  const tenantSql = tid != null ? " AND tenant_id = ?" : "";
  const tenantParams: unknown[] = tid != null ? [tid] : [];

  // Собираем уникальные manager_id у которых:
  //  - manager_name пуст (или forceAll)
  //  - кэш в managers ещё не заполнен
  const sql = opts?.forceAll
    ? `SELECT DISTINCT manager_id FROM calls WHERE manager_id IS NOT NULL AND manager_id != ''${tenantSql}`
    : `SELECT DISTINCT manager_id FROM calls
        WHERE manager_id IS NOT NULL AND manager_id != ''
          AND (manager_name IS NULL OR manager_name = '')${tenantSql}`;
  const rows = await db.prepare(sql).all<{ manager_id: string }>(...tenantParams);
  const ids = rows.map((r) => r.manager_id);
  if (ids.length === 0) return { uniqueIds: 0, fetched: 0, updatedCalls: 0 };

  // Сначала пробуем взять из локального кэша (скоуп по тенанту, если задан)
  const cachedRows = await db
    .prepare(
      `SELECT id, name, email FROM managers WHERE id IN (${ids.map(() => "?").join(",")})${tenantSql}`
    )
    .all<{ id: string; name: string | null; email: string | null }>(...ids, ...tenantParams);
  const cached = new Map(cachedRows.map((r) => [r.id, { name: r.name, email: r.email }]));

  const idsToFetch = ids.filter((id) => !cached.has(id) || !cached.get(id)?.name);
  let fetched = 0;
  if (idsToFetch.length > 0) {
    const users = await usersGetBatch(idsToFetch);
    fetched = users.size;
    // Когда tenantId задан — пишем строку в рамках тенанта; ON CONFLICT со скоупом
    // по тенанту в WHERE, чтобы не перезатереть строку чужого тенанта (PK = id).
    const upsert = tid != null
      ? db.prepare(
          `INSERT INTO managers (id, tenant_id, name, email, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, email = excluded.email, is_active = excluded.is_active,
             updated_at = datetime('now')
           WHERE managers.tenant_id = ?`
        )
      : db.prepare(
          `INSERT INTO managers (id, name, email, is_active, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, email = excluded.email, is_active = excluded.is_active,
             updated_at = datetime('now')`
        );
    for (const [bxId, u] of users) {
      const name = formatUserName(u);
      if (tid != null) {
        await upsert.run(bxId, tid, name, u.EMAIL ?? null, u.ACTIVE !== false, tid);
      } else {
        await upsert.run(bxId, name, u.EMAIL ?? null, u.ACTIVE !== false);
      }
      cached.set(bxId, { name, email: u.EMAIL ?? null });
    }
  }

  // Проставляем manager_name в calls (скоуп по тенанту, если задан)
  const updateStmt = db.prepare(
    `UPDATE calls SET manager_name = ?
      WHERE manager_id = ?
        AND (manager_name IS NULL OR manager_name = '' OR ?)${tenantSql}`
  );
  let updated = 0;
  for (const id of ids) {
    const name = cached.get(id)?.name;
    if (!name) continue;
    const r = await updateStmt.run(name, id, !!opts?.forceAll, ...tenantParams);
    updated += r.changes;
  }

  return { uniqueIds: ids.length, fetched, updatedCalls: updated };
}
