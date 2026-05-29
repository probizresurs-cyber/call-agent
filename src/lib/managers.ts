import { getDb } from "./db";
import { usersGetBatch, formatUserName } from "./bitrix";

/**
 * Обновляет таблицу managers + проставляет manager_name в calls
 * для всех уникальных manager_id у которых имя ещё не известно.
 *
 * Вызывается:
 *  - после успешного импорта (для новых звонков)
 *  - можно дёрнуть вручную через /api/managers/backfill
 */
export async function backfillManagerNames(opts?: { forceAll?: boolean }): Promise<{
  uniqueIds: number;
  fetched: number;
  updatedCalls: number;
}> {
  const db = getDb();

  // Собираем уникальные manager_id у которых:
  //  - manager_name пуст (или forceAll)
  //  - кэш в managers ещё не заполнен
  const sql = opts?.forceAll
    ? `SELECT DISTINCT manager_id FROM calls WHERE manager_id IS NOT NULL AND manager_id != ''`
    : `SELECT DISTINCT manager_id FROM calls
        WHERE manager_id IS NOT NULL AND manager_id != ''
          AND (manager_name IS NULL OR manager_name = '')`;
  const rows = db.prepare(sql).all() as Array<{ manager_id: string }>;
  const ids = rows.map((r) => r.manager_id);
  if (ids.length === 0) return { uniqueIds: 0, fetched: 0, updatedCalls: 0 };

  // Сначала пробуем взять из локального кэша
  const cachedRows = db
    .prepare(
      `SELECT id, name, email FROM managers WHERE id IN (${ids.map(() => "?").join(",")})`
    )
    .all(...ids) as Array<{ id: string; name: string | null; email: string | null }>;
  const cached = new Map(cachedRows.map((r) => [r.id, { name: r.name, email: r.email }]));

  const idsToFetch = ids.filter((id) => !cached.has(id) || !cached.get(id)?.name);
  let fetched = 0;
  if (idsToFetch.length > 0) {
    const users = await usersGetBatch(idsToFetch);
    fetched = users.size;
    const upsert = db.prepare(
      `INSERT INTO managers (id, name, email, is_active, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, email = excluded.email, is_active = excluded.is_active,
         updated_at = datetime('now')`
    );
    for (const [bxId, u] of users) {
      const name = formatUserName(u);
      upsert.run(bxId, name, u.EMAIL ?? null, u.ACTIVE === false ? 0 : 1);
      cached.set(bxId, { name, email: u.EMAIL ?? null });
    }
  }

  // Проставляем manager_name в calls
  const updateStmt = db.prepare(
    `UPDATE calls SET manager_name = ?
      WHERE manager_id = ?
        AND (manager_name IS NULL OR manager_name = '' OR ?)`
  );
  let updated = 0;
  for (const id of ids) {
    const name = cached.get(id)?.name;
    if (!name) continue;
    const r = updateStmt.run(name, id, opts?.forceAll ? 1 : 0);
    updated += r.changes;
  }

  return { uniqueIds: ids.length, fetched, updatedCalls: updated };
}
