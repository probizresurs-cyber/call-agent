/**
 * Postgres connection через node-postgres + Drizzle ORM.
 *
 * Используется параллельно с lib/db.ts (SQLite) пока идёт миграция.
 * После cutover lib/db.ts удаляется.
 *
 * ENV:
 *   DATABASE_URL=postgres://user:pass@host:5432/dbname
 */
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL не задан в .env — нужен URL Postgres");
  }
  _pool = new Pool({
    connectionString: url,
    // Разумные дефолты для одной инсталляции
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _pool.on("error", (err) => {
    console.error("[pg] pool error:", err.message);
  });
  return _pool;
}

export function getPg(): NodePgDatabase<typeof schema> {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema, logger: process.env.PG_LOG === "true" });
  return _db;
}

/** Закрыть pool — для graceful shutdown в скриптах */
export async function closePg(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

/** Быстрая проверка соединения — для healthcheck */
export async function pingPg(): Promise<boolean> {
  try {
    const r = await getPool().query("SELECT 1 AS ok");
    return r.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

// Реэкспорт schema для удобства импорта в queries
export { schema };
export type Db = NodePgDatabase<typeof schema>;
