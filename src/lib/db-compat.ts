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
  // datetime('now','-X hour/minute/day') → (NOW() - interval 'X hours')
  out = out.replace(/datetime\s*\(\s*'now'\s*,\s*'([+-]?\d+)\s+(hour|minute|day|second)s?'\s*\)/gi,
    (_, n, unit) => `(NOW() + interval '${n} ${unit}')`);
  // datetime(column_name) → column_name (в PG это уже timestamp, обёртка не нужна).
  // Распознаём ТОЛЬКО форму с одним идентификатором (буквы/цифры/_/.) — не трогаем datetime('now',...).
  out = out.replace(/datetime\s*\(\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\)/g, "$1");
  // date('now', '-X day') → (CURRENT_DATE - INTERVAL 'X days')::text — SQLite-функция.
  out = out.replace(/date\s*\(\s*'now'\s*,\s*'([+-]?\d+)\s+(day|hour|minute|second)s?'\s*\)/gi,
    (_, n, unit) => `((CURRENT_DATE + INTERVAL '${n} ${unit}')::text)`);
  // date('now') → CURRENT_DATE::text
  out = out.replace(/date\s*\(\s*'now'\s*\)/gi, "(CURRENT_DATE::text)");
  // substr(table.started_at, 1, 10) — нужен ::text приведение, т.к. в PG это timestamptz.
  // Покрываем все *_at колонки чтобы не пропустить created_at/updated_at и т.п.
  out = out.replace(/substr\s*\(\s*([a-zA-Z_][a-zA-Z0-9_.]*_at)\s*,/gi, "substr($1::text,");
  // sessions.user (SQLite legacy column name) → legacy_login (PG schema).
  // `user` это reserved word в PG, поэтому колонка переименована.
  // Покрываем: INSERT (id, user, user_id, ...), SELECT s.user, sessions.user
  out = out.replace(/\bs\.user\b(?!\w|_)/g, "s.legacy_login");
  out = out.replace(/\bsessions\.user\b(?!\w|_)/g, "sessions.legacy_login");
  // INSERT/UPDATE списки колонок — `, user,` после открывающей скобки
  out = out.replace(/(INSERT\s+INTO\s+sessions\s*\([^)]*?,\s*)user(\s*,)/gi, "$1legacy_login$2");
  out = out.replace(/(INSERT\s+INTO\s+sessions\s*\(\s*)user(\s*,)/gi, "$1legacy_login$2");

  // SQLite хранит boolean как INT 0/1; PG — настоящий boolean. Конвертируем литералы для известных
  // boolean-колонок в SQL (только сравнения = 1 / = 0 и COALESCE(...,1/0)). Параметры (?$N) Adapter
  // не знает по типу — boolean параметры должны передаваться в код как true/false (better-sqlite3 OK).
  const boolCols = ["is_active", "is_service", "is_admin", "is_owner"];
  for (const col of boolCols) {
    out = out.replace(new RegExp(`(\\b${col})\\s*=\\s*1\\b`, "gi"), "$1 = TRUE");
    out = out.replace(new RegExp(`(\\b${col})\\s*=\\s*0\\b`, "gi"), "$1 = FALSE");
    out = out.replace(new RegExp(`COALESCE\\s*\\(\\s*([a-zA-Z_][a-zA-Z0-9_.]*\\.${col})\\s*,\\s*1\\s*\\)`, "gi"), "COALESCE($1, TRUE)");
    out = out.replace(new RegExp(`COALESCE\\s*\\(\\s*([a-zA-Z_][a-zA-Z0-9_.]*\\.${col})\\s*,\\s*0\\s*\\)`, "gi"), "COALESCE($1, FALSE)");
  }
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
    const pg = require("pg") as typeof import("pg");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL не задан (DB_DRIVER=postgres)");

    // КРИТИЧНО: возвращаем timestamp/timestamptz/date как СТРОКУ, а не как JS Date.
    // SQLite-код везде работает со started_at/created_at как со строкой; если pg вернёт Date,
    // React-рендеринг падает с "Objects are not valid as a React child", а .replace()/.slice()
    // на Date-объектах кидают TypeError. Парсер 1114 = timestamp, 1184 = timestamptz, 1082 = date.
    pg.types.setTypeParser(1114, (s: string) => s);
    pg.types.setTypeParser(1184, (s: string) => s);
    pg.types.setTypeParser(1082, (s: string) => s);
    // BIGINT (oid 20) — pg по умолчанию возвращает как string чтобы не терять точность,
    // но наши id влезают в JS number. Преобразуем чтобы code сравнения row.id === N работали.
    pg.types.setTypeParser(20, (s: string) => parseInt(s, 10));

    _pgPool = new pg.Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    // ─── Postgres миграции ───────────────────────────────────────────────────
    // applyAlterMigrations() в db.ts использует SQLite-только pragma_table_info.
    // Для Postgres все DDL-изменения (новые таблицы + новые колонки) живут здесь.
    // Всё идемпотентно: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
    // Fire-and-forget — ошибки логируем, не роняем процесс.
    const migPool = _pgPool;

    // ── Шаг 1: создать новые таблицы admin-модуля ──────────────────────────
    migPool.query(`
      CREATE TABLE IF NOT EXISTS ca_plans (
        id              SERIAL PRIMARY KEY,
        name            TEXT NOT NULL,
        price_monthly   INTEGER NOT NULL,
        price_annual    INTEGER,
        calls_limit     INTEGER NOT NULL,
        managers_limit  INTEGER,
        features_json   TEXT,
        active          BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ca_referrals (
        id                  SERIAL PRIMARY KEY,
        code                TEXT UNIQUE NOT NULL,
        name                TEXT,
        created_by_user_id  INTEGER,
        tenant_id           INTEGER,
        uses_count          INTEGER DEFAULT 0,
        max_uses            INTEGER,
        discount_pct        INTEGER DEFAULT 0,
        expires_at          TIMESTAMP,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ca_promos (
        id            SERIAL PRIMARY KEY,
        code          TEXT UNIQUE NOT NULL,
        description   TEXT,
        discount_pct  INTEGER DEFAULT 0,
        bonus_calls   INTEGER DEFAULT 0,
        uses_count    INTEGER DEFAULT 0,
        max_uses      INTEGER,
        active        BOOLEAN DEFAULT TRUE,
        expires_at    TIMESTAMP,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ca_partners (
        id              SERIAL PRIMARY KEY,
        name            TEXT NOT NULL,
        email           TEXT,
        contact         TEXT,
        commission_pct  INTEGER DEFAULT 10,
        ref_code        TEXT UNIQUE,
        clients_count   INTEGER DEFAULT 0,
        revenue_total   INTEGER DEFAULT 0,
        status          TEXT DEFAULT 'active',
        notes           TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ca_payments (
        id              SERIAL PRIMARY KEY,
        tenant_id       INTEGER,
        tenant_name     TEXT,
        amount          INTEGER NOT NULL,
        currency        TEXT DEFAULT 'RUB',
        plan            TEXT,
        status          TEXT DEFAULT 'pending',
        payment_method  TEXT,
        external_id     TEXT,
        period_from     DATE,
        period_to       DATE,
        notes           TEXT,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS card_discrepancies (
        id                    SERIAL PRIMARY KEY,
        tenant_id             INTEGER NOT NULL,
        call_id               INTEGER NOT NULL,
        entity_type           TEXT,
        entity_id             TEXT,
        field_name            TEXT NOT NULL,
        field_label           TEXT,
        card_value            TEXT,
        transcript_evidence   TEXT,
        suggested_value       TEXT,
        severity              TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'pending',
        routed_to_user_id     INTEGER,
        ai_model              TEXT,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at           TIMESTAMP,
        resolved_by_user_id   INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_card_discrepancies_tenant_status
        ON card_discrepancies(tenant_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_card_discrepancies_call
        ON card_discrepancies(call_id);
      CREATE INDEX IF NOT EXISTS idx_card_discrepancies_routed
        ON card_discrepancies(routed_to_user_id, status);
    `).then(async () => {
      // Seed дефолтных тарифов если таблица только что создана и пустая
      const r = await migPool.query("SELECT COUNT(*) FROM ca_plans");
      if (parseInt(r.rows[0].count, 10) === 0) {
        await migPool.query(`
          INSERT INTO ca_plans (name, price_monthly, price_annual, calls_limit, managers_limit)
          VALUES
            ('Старт',   3500,  33600,  200,  1),
            ('Базовый', 5500,  52800,  500,  5),
            ('Про',    12000, 115200, 1500, 20),
            ('Бизнес', 30000, 288000, 5000, NULL)
        `);
      }
    }).catch((e: Error) => {
      console.warn("[pg-migrations] CREATE TABLE warning:", e.message.split("\n")[0]);
    });

    // ── Шаг 2: добавить новые колонки в существующие таблицы ───────────────
    migPool.query(`
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS deal_context_json    TEXT;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS interaction_type     TEXT NOT NULL DEFAULT 'call';
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS channel              TEXT NOT NULL DEFAULT 'bitrix_telephony';
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS content_text         TEXT;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS detected_product     TEXT;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS tenant_id            INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS user_id              INTEGER;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS bitrix_deal_title    TEXT;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS bitrix_lead_title    TEXT;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS bitrix_contact_name  TEXT;
      ALTER TABLE calls     ADD COLUMN IF NOT EXISTS bitrix_portal_url    TEXT;
      ALTER TABLE analyses  ADD COLUMN IF NOT EXISTS client_name          TEXT;
      ALTER TABLE analyses  ADD COLUMN IF NOT EXISTS checklist_scores_json TEXT;
      ALTER TABLE analyses  ADD COLUMN IF NOT EXISTS coaching_tips_json   TEXT;
      ALTER TABLE analyses  ADD COLUMN IF NOT EXISTS call_stage           TEXT;
      ALTER TABLE analyses  ADD COLUMN IF NOT EXISTS detected_product     TEXT;
      ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS dialogue_json      TEXT;
      ALTER TABLE sales_scripts ADD COLUMN IF NOT EXISTS checklist_json   TEXT;
      ALTER TABLE sales_scripts ADD COLUMN IF NOT EXISTS product          TEXT;
      ALTER TABLE sales_scripts ADD COLUMN IF NOT EXISTS direction        TEXT DEFAULT 'all';
      ALTER TABLE sales_scripts ADD COLUMN IF NOT EXISTS tenant_id        INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE managers  ADD COLUMN IF NOT EXISTS tenant_id            INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE sessions  ADD COLUMN IF NOT EXISTS user_id              INTEGER;
      ALTER TABLE sessions  ADD COLUMN IF NOT EXISTS tenant_id            INTEGER;
      ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS discrepancy_enabled           BOOLEAN DEFAULT FALSE;
      ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS discrepancy_recipient_mode    TEXT DEFAULT 'manager';
      ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS discrepancy_admin_user_ids    TEXT;
      ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS discrepancy_action_mode       TEXT DEFAULT 'manual';
      ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS discrepancy_custom_fields     TEXT;
      ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS discrepancy_severity_min      TEXT DEFAULT 'medium';
      ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS analysis_model                TEXT;
    `).catch((e: Error) => {
      console.warn("[pg-migrations] ALTER TABLE warning:", e.message.split("\n")[0]);
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
