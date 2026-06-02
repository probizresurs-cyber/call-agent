/**
 * DB Compatibility Layer — единый async-интерфейс над SQLite и PostgreSQL.
 *
 * Переключается через ENV: DB_DRIVER=sqlite|postgres (default: sqlite)
 *
 * API напоминает better-sqlite3, но всё async:
 *   const stmt = db.prepare("SELECT * FROM x WHERE id = ?");
 *   const row  = await stmt.get(123);
 *   const rows = await stmt.all();
 *   const r    = await stmt.run(...params);  // { changes, lastInsertRowid }
 *
 * Для SQLite — синхронный better-sqlite3 обёрнут в Promise.resolve.
 * Для Postgres — pg.Pool, автоматическая конвертация ? → $1,$2,...
 */
import fs from "fs";
import path from "path";

// ───────────────────────────────────────────────────────
// Общий интерфейс

export interface CompatStatement {
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
}

export interface CompatDb {
  prepare(sql: string): CompatStatement;
  exec(sql: string): Promise<void>;
  /** Только для SQLite (no-op в pg). Если нужен PRAGMA для совместимости. */
  pragma(stmt: string): unknown;
  /** Закрыть соединение — для скриптов/graceful shutdown */
  close(): Promise<void>;
}

// ───────────────────────────────────────────────────────
// Утилиты

/** ? → $1, $2, $3, ... для Postgres */
function questionMarksToPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Конвертация SQLite SQL → Postgres-совместимый.
 * Намеренно консервативно: меняем только то что точно ломается.
 */
function adaptSqlToPg(sql: string): string {
  let out = questionMarksToPgPlaceholders(sql);
  // datetime('now') → NOW()
  out = out.replace(/datetime\s*\(\s*'now'\s*\)/gi, "NOW()");
  // datetime('now','-X hour/minute') → NOW() - interval 'X hours'
  out = out.replace(/datetime\s*\(\s*'now'\s*,\s*'([+-]?\d+)\s+(hour|minute|day|second)'\s*\)/gi,
    (_, n, unit) => `(NOW() + interval '${n} ${unit}')`);
  // substr(x, 1, 10) — оба поддерживают (no-op)
  // SUM(CASE WHEN ... THEN 1 ELSE 0 END) — оба
  // INSERT ... ON CONFLICT(col) DO NOTHING — оба
  // LIMIT ? OFFSET ? — оба
  return out;
}

// ───────────────────────────────────────────────────────
// SQLite backend (текущий — синхронный, обёрнут в async)

function makeSqliteDb(): CompatDb {
  // Lazy load — не подгружаем better-sqlite3 если работаем на pg
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const DB_DIR = path.join(process.cwd(), "data");
  const DB_PATH = path.join(DB_DIR, "call-agent.db");
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = DELETE");
  db.pragma("synchronous = FULL");
  db.pragma("busy_timeout = 10000");
  db.pragma("foreign_keys = ON");

  return {
    prepare(sql: string): CompatStatement {
      const stmt = db.prepare(sql);
      return {
        async get<T>(...params: unknown[]) {
          return stmt.get(...params) as T | undefined;
        },
        async all<T>(...params: unknown[]) {
          return stmt.all(...params) as T[];
        },
        async run(...params: unknown[]) {
          const r = stmt.run(...params);
          return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
        },
      };
    },
    async exec(sql: string) { db.exec(sql); },
    pragma(stmt: string) { return db.pragma(stmt); },
    async close() { db.close(); },
  };
}

// ───────────────────────────────────────────────────────
// Postgres backend

let _pgPool: import("pg").Pool | null = null;

function makePgDb(): CompatDb {
  if (!_pgPool) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { Pool } = require("pg") as typeof import("pg");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL не задан (DB_DRIVER=postgres)");
    _pgPool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  const pool = _pgPool;

  return {
    prepare(sql: string): CompatStatement {
      const pgSql = adaptSqlToPg(sql);
      const isInsert = /^\s*insert\s/i.test(sql);
      // Для INSERT добавляем RETURNING id чтобы вернуть lastInsertRowid
      const sqlWithReturning =
        isInsert && !/\breturning\b/i.test(pgSql) && /\bid\b/i.test(pgSql)
          ? `${pgSql} RETURNING id`
          : pgSql;
      return {
        async get<T>(...params: unknown[]) {
          const r = await pool.query(sqlWithReturning, params);
          return r.rows[0] as T | undefined;
        },
        async all<T>(...params: unknown[]) {
          const r = await pool.query(pgSql, params);
          return r.rows as T[];
        },
        async run(...params: unknown[]) {
          const r = await pool.query(sqlWithReturning, params);
          const last = r.rows[0]?.id;
          return {
            changes: r.rowCount ?? 0,
            lastInsertRowid: last != null ? Number(last) : undefined,
          };
        },
      };
    },
    async exec(sql: string) {
      // multi-statement через ; — pg поддерживает в одном запросе
      await pool.query(adaptSqlToPg(sql));
    },
    pragma(_stmt: string) {
      // no-op для pg
      return null;
    },
    async close() {
      await pool.end();
      _pgPool = null;
    },
  };
}

// ───────────────────────────────────────────────────────
// Singleton dispatcher

let _db: CompatDb | null = null;

export function getCompatDb(): CompatDb {
  if (_db) return _db;
  const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();
  _db = driver === "postgres" || driver === "pg" ? makePgDb() : makeSqliteDb();
  return _db;
}

export function getDriverName(): string {
  return (process.env.DB_DRIVER || "sqlite").toLowerCase();
}

// ───────────────────────────────────────────────────────
// Shortcut helpers — для inline async-запросов без stmt-объекта

export async function dbGet<T = Record<string, unknown>>(
  sql: string, ...params: unknown[]
): Promise<T | undefined> {
  return getCompatDb().prepare(sql).get<T>(...params);
}

export async function dbAll<T = Record<string, unknown>>(
  sql: string, ...params: unknown[]
): Promise<T[]> {
  return getCompatDb().prepare(sql).all<T>(...params);
}

export async function dbRun(
  sql: string, ...params: unknown[]
): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
  return getCompatDb().prepare(sql).run(...params);
}

/**
 * Алиас — для постепенной миграции с getDb() → getDbAsync().
 * Когда все файлы конвертированы, getDb() из lib/db.ts удаляется,
 * а это становится единственным способом доступа к БД.
 */
export const getDbAsync = getCompatDb;
