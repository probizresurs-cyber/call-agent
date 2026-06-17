import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "call-agent.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  // DELETE journal вместо WAL.
  // WAL даёт лучшую конкурентность, но при multi-process записи (web + worker)
  // на этом VPS он стабильно вызывал "database disk image is malformed".
  // DELETE использует exclusive lock на запись — медленнее, но надёжно.
  db.pragma("journal_mode = DELETE");
  // synchronous=FULL — гарантирует что WAL/journal записан на диск перед commit
  db.pragma("synchronous = FULL");
  // busy_timeout — если другая транзакция держит lock, ждём до 10 сек
  db.pragma("busy_timeout = 10000");
  db.pragma("foreign_keys = ON");

  // Миграции выполняются на старте процесса (idempotent CREATE IF NOT EXISTS)
  db.exec(SCHEMA_SQL);
  applyAlterMigrations(db);

  _db = db;
  return db;
}

/**
 * SQLite не поддерживает `ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
 * поэтому идём через pragma_table_info и добавляем колонку только если её нет.
 * Добавлять можно только сюда (без дефолта на CURRENT_TIMESTAMP — это запрещено для ADD COLUMN).
 */
function applyAlterMigrations(db: Database.Database) {
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const exists = db
      .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, column);
    if (!exists) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  };

  ensureColumn("sales_scripts", "checklist_json", "TEXT");
  ensureColumn("transcripts", "dialogue_json", "TEXT");
  ensureColumn("analyses", "client_name", "TEXT");
  ensureColumn("analyses", "checklist_scores_json", "TEXT");
  ensureColumn("analyses", "coaching_tips_json", "TEXT");  // §5.2 MASTER-TZ — советы менеджеру
  ensureColumn("analyses", "call_stage", "TEXT");           // cold/qualification/deal_followup/informational/no_contact
  ensureColumn("calls", "deal_context_json", "TEXT");

  // ─────── Фаза 2 MASTER-TZ: омниканальность ───────
  // type: call (звонок, default) / chat / email / meeting
  // channel: канал-источник (bitrix_telephony, openlines, whatsapp, telegram, email_imap, manual, zoom, yandex_telemost...)
  // content_text: для чатов/email — сразу текст переписки, минуя транскрипцию
  ensureColumn("calls", "interaction_type", "TEXT NOT NULL DEFAULT 'call'");
  ensureColumn("calls", "channel", "TEXT NOT NULL DEFAULT 'bitrix_telephony'");
  ensureColumn("calls", "content_text", "TEXT");

  // Мульти-скрипты: product (МП/МК/др.) и direction (in/out/all)
  ensureColumn("sales_scripts", "product", "TEXT");
  ensureColumn("sales_scripts", "direction", "TEXT DEFAULT 'all'");
  // Ключевые фразы/словосочетания — подсказка для AI при определении типа звонка (МП vs МК).
  // Хранится как текст: по одной фразе на строку (или через запятую).
  ensureColumn("sales_scripts", "key_phrases", "TEXT DEFAULT NULL");
  // В calls — какой product определил AI (для статистики)
  ensureColumn("calls", "detected_product", "TEXT");
  ensureColumn("analyses", "detected_product", "TEXT");

  // ─────── Спринт 1.1: tenant_id на всех доменных таблицах ───────
  // Default = 1 (Орлинк). Future-proofing для multi-tenancy без даунтайма.
  ensureColumn("calls", "tenant_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("managers", "tenant_id", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("sales_scripts", "tenant_id", "INTEGER NOT NULL DEFAULT 1");

  // ─────── Per-manager: закреплённый продукт + перенос анализа в CRM ───────
  // default_product — ПРИОРИТЕТНАЯ подсказка AI-детекту (не жёсткая привязка):
  //   NULL = продукт не закреплён, AI определяет сам.
  //   код продукта (МП/МК/...) = склоняем AI к нему при прочих равных + fallback.
  ensureColumn("managers", "default_product", "TEXT");
  // crm_sync_enabled — разрешить перенос комментария анализа в timeline сделки Bitrix.
  //   Default 0 (выключено): включается осознанно для конкретных менеджеров.
  //   Работает В ДОПОЛНЕНИЕ к DRY_RUN-гарду (оба должны разрешать запись).
  ensureColumn("managers", "crm_sync_enabled", "INTEGER NOT NULL DEFAULT 0");

  // user_id у platform-пользователей кто может видеть звонок (linked manager)
  ensureColumn("calls", "user_id", "INTEGER"); // NULL = не привязан к пользователю платформы

  // ─────── Bitrix enrich: имена сделки/лида/контакта + базовый URL портала ───────
  // Догружаются в pipeline.processCall после получения deal_id/lead_id/contact_id,
  // используются для построения ссылок на CRM-карточки в UI карточки звонка.
  ensureColumn("calls", "bitrix_deal_title", "TEXT");
  ensureColumn("calls", "bitrix_lead_title", "TEXT");
  ensureColumn("calls", "bitrix_contact_name", "TEXT");
  ensureColumn("calls", "bitrix_portal_url", "TEXT");

  // На существующей sessions таблице добавляем user_id/tenant_id если их нет.
  // (В CREATE TABLE они уже есть, но БД из прошлой версии существует со старой схемой.)
  ensureColumn("sessions", "user_id", "INTEGER");
  ensureColumn("sessions", "tenant_id", "INTEGER");

  // ─────── Модуль «AI-проверка карточки CRM» (discrepancy detector) ───────
  // Per-tenant настройки модуля: включён ли, кому слать находки,
  // что делать (вручную/auto-approve), какие UF_CRM_* поля проверять,
  // и какой минимальный порог severity показывать.
  ensureColumn("tenants", "discrepancy_enabled", "INTEGER DEFAULT 0");
  ensureColumn("tenants", "discrepancy_recipient_mode", "TEXT DEFAULT 'manager'");
  ensureColumn("tenants", "discrepancy_admin_user_ids", "TEXT DEFAULT NULL");
  ensureColumn("tenants", "discrepancy_action_mode", "TEXT DEFAULT 'manual'");
  ensureColumn("tenants", "discrepancy_custom_fields", "TEXT DEFAULT NULL");
  ensureColumn("tenants", "discrepancy_severity_min", "TEXT DEFAULT 'medium'");

  // Настройка модели AI для анализа звонков на уровне тенанта.
  // NULL = использовать дефолт из ENV (AI_PROVIDER + дефолтная модель).
  // Формат: 'openai:gpt-4o', 'openai:gpt-4o-mini', 'anthropic:claude-sonnet-4-6', etc.
  ensureColumn("tenants", "analysis_model", "TEXT DEFAULT NULL");

  // Глоссарий названий компании (per-tenant). Whisper распознаёт названия на слух
  // по-разному (Орлинг, Арлинк), а нужно консистентно («Орлинк»). Подставляется в
  // промпт анализатора, чтобы AI использовал правильные написания во всех текстовых полях.
  ensureColumn("tenants", "glossary", "TEXT DEFAULT NULL");

  // Таблица найденных расхождений между карточкой CRM и стенограммой звонка.
  // Идемпотентная — CREATE IF NOT EXISTS, индексы тоже.
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_discrepancies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      call_id INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
      entity_type TEXT,                       -- 'deal'|'lead'|'contact'
      entity_id TEXT,
      field_name TEXT NOT NULL,                -- 'COMMENTS', 'UF_CRM_5F2_BUDGET', etc.
      field_label TEXT,                        -- человеко-читаемый ярлык
      card_value TEXT,                         -- что сейчас в карточке
      transcript_evidence TEXT,                -- цитата из стенограммы
      suggested_value TEXT,                    -- что AI предлагает записать
      severity TEXT NOT NULL,                  -- 'low'|'medium'|'high'
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'accepted'|'rejected'|'manual_fixed'|'auto_applied'
      routed_to_user_id INTEGER,
      ai_model TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by_user_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_card_discrepancies_tenant_status
      ON card_discrepancies(tenant_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_card_discrepancies_call
      ON card_discrepancies(call_id);
    CREATE INDEX IF NOT EXISTS idx_card_discrepancies_routed
      ON card_discrepancies(routed_to_user_id, status);
  `);

  // ─────── Заявки на подключение (публичный опросник онбординга) ───────
  // Заполняется публичной формой /call-agent/onboarding (без авторизации).
  // Ключевые поля вынесены в колонки, полный набор ответов — в payload_json.
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT,
      bitrix_url TEXT NOT NULL,
      telephony_type TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_onboarding_requests_status
      ON onboarding_requests(status, created_at DESC);
  `);

  // ─────── Рефералки и промокоды (CA-admin) ───────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ca_referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT,
      created_by_user_id INTEGER,
      tenant_id INTEGER,
      uses_count INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT NULL,
      discount_pct INTEGER DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ca_referrals_code ON ca_referrals(code);

    CREATE TABLE IF NOT EXISTS ca_promos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      discount_pct INTEGER DEFAULT 0,
      bonus_calls INTEGER DEFAULT 0,
      uses_count INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT NULL,
      active INTEGER DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ca_promos_code ON ca_promos(code);
  `);

  // ─────── Тарифные планы Call-Agent (CA-admin) ───────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ca_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price_monthly INTEGER NOT NULL,
      price_annual INTEGER,
      calls_limit INTEGER NOT NULL,
      managers_limit INTEGER,
      features_json TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ─────── Расписания автоматической отправки отчётов в Bitrix ───────
  // SQLite-аналог Postgres-версии в db-compat.ts.
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_schedules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id       INTEGER NOT NULL,
      name            TEXT NOT NULL,
      scope           TEXT NOT NULL,            -- 'manager'|'team'
      manager_id      TEXT,                     -- bitrix manager id (про кого), scope=manager
      recipient_kind  TEXT NOT NULL,            -- 'user'|'chat'
      recipient_id    TEXT NOT NULL,            -- bitrix user id ИЛИ "chatN"
      recipient_name  TEXT,                     -- кэш для UI
      frequency       TEXT NOT NULL,            -- 'daily'|'weekly'
      time_hhmm       TEXT NOT NULL,            -- 'HH:MM'
      days_of_week    TEXT,                     -- JSON array [1..7] для weekly
      period_kind     TEXT NOT NULL DEFAULT 'yesterday',
      enabled         INTEGER DEFAULT 1,
      last_run_at     TEXT,
      last_run_status TEXT,                     -- 'ok'|'failed'
      last_run_error  TEXT,
      next_run_at     TEXT,                     -- precomputed (ISO)
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_report_schedules_due
      ON report_schedules(enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant
      ON report_schedules(tenant_id);
  `);

  // Засеваем дефолтные планы если таблица пустая
  seedCaPlans(db);

  // Засеваем дефолтного тенанта если ещё не существует
  seedDefaultData(db);
}

function seedCaPlans(db: Database.Database) {
  const hasPlans = db.prepare(`SELECT 1 FROM ca_plans LIMIT 1`).get();
  if (hasPlans) return;

  const insert = db.prepare(
    `INSERT INTO ca_plans (name, price_monthly, price_annual, calls_limit, managers_limit, active)
     VALUES (?, ?, ?, ?, ?, 1)`
  );
  insert.run("Старт",   3500,  35000,  200,  1);
  insert.run("Базовый", 5500,  55000,  500,  5);
  insert.run("Про",     12000, 120000, 1500, 20);
  insert.run("Бизнес",  30000, 300000, 5000, null);
}

function seedDefaultData(db: Database.Database) {
  // Default tenant
  const hasTenant = db.prepare(`SELECT 1 FROM tenants WHERE id = 1`).get();
  if (!hasTenant) {
    db.prepare(`INSERT INTO tenants (id, name, slug) VALUES (1, 'Орлинк', 'orlink')`).run();
  }

  // Default owner-user из .env (миграция с file-based auth на DB-based)
  const adminLogin = process.env.ADMIN_LOGIN;
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  if (adminLogin && adminHash) {
    const existing = db.prepare(`SELECT id FROM users WHERE login = ?`).get(adminLogin);
    if (!existing) {
      db.prepare(
        `INSERT INTO users (tenant_id, login, password_hash, role, name)
         VALUES (1, ?, ?, 'owner', 'Owner (из .env)')`
      ).run(adminLogin, adminHash);
    }
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bitrix_call_id TEXT UNIQUE,
  bitrix_deal_id TEXT,
  bitrix_lead_id TEXT,
  bitrix_contact_id TEXT,
  bitrix_activity_id TEXT,
  manager_id TEXT,
  manager_name TEXT,
  client_phone TEXT,
  direction TEXT,                  -- 'in' | 'out'
  started_at TEXT,                 -- ISO 8601
  duration_sec INTEGER DEFAULT 0,
  recording_url TEXT,
  recording_path TEXT,             -- локальный путь к mp3
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | downloading | transcribing | analyzing | syncing | done | failed
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_manager ON calls(manager_id);

CREATE TABLE IF NOT EXISTS transcripts (
  call_id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  segments_json TEXT,              -- [{start,end,speaker?,text}]
  language TEXT,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);
-- FTS5 виртуальная таблица — отключена.
-- В multi-process WAL-режиме FTS5 склонна к corruption при конкурентных записях.
-- Поиск по тексту делаем простым LIKE — для < 100k звонков работает быстро.
-- Если/когда вернём FTS5 — нужно либо одиночный writer-процесс, либо отдельная БД для индекса.

CREATE TABLE IF NOT EXISTS analyses (
  call_id INTEGER PRIMARY KEY,
  summary TEXT,
  sentiment TEXT,                  -- positive | neutral | negative
  manager_score REAL,              -- 0..10
  script_compliance REAL,          -- 0..1
  next_action TEXT,
  objections_json TEXT,            -- string[]
  topics_json TEXT,                -- string[]
  raw_json TEXT,                   -- весь ответ Claude
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS managers (
  id TEXT PRIMARY KEY,             -- bitrix user id
  name TEXT,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  default_product TEXT,            -- закреплённый продукт (приоритетная подсказка AI), NULL = не закреплён
  crm_sync_enabled INTEGER NOT NULL DEFAULT 0,  -- переносить анализ в CRM Bitrix (default off)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content_md TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ─────── Спринт 1.1: tenants + users (multi-tenant фундамент) ───────

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  -- настройки тенанта (JSON): budget, retention_days, integrations
  settings_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  login TEXT NOT NULL,                       -- email или username
  password_hash TEXT NOT NULL,                -- bcrypt
  role TEXT NOT NULL DEFAULT 'manager',       -- owner | admin | head | manager
  name TEXT,                                  -- ФИО
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  -- Привязка к Bitrix-менеджеру (для роли manager — он видит свои звонки)
  bitrix_manager_id TEXT,                     -- managers.id
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, login)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_users_bitrix ON users(bitrix_manager_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,             -- сессионный токен
  user TEXT NOT NULL,              -- логин (legacy) — оставляем для обратной совместимости
  user_id INTEGER,                 -- FK к users.id (новый путь)
  tenant_id INTEGER,               -- для быстрого фильтра без JOIN
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- ─────── Call-Agent SaaS: партнёры и платежи ───────

CREATE TABLE IF NOT EXISTS ca_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  contact TEXT,
  commission_pct INTEGER DEFAULT 10,
  ref_code TEXT UNIQUE,
  clients_count INTEGER DEFAULT 0,
  revenue_total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ca_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  tenant_name TEXT,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'RUB',
  plan TEXT,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  external_id TEXT,
  period_from TEXT,
  period_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ──────────────────────────────────────────────────────────────
// Типы и небольшие хелперы

export type CallStatus =
  | "pending"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "syncing"
  | "done"
  | "failed"
  | "no_recording"      // запись звонка отсутствует в Битриксе (не наша ошибка)
  | "budget_exceeded";  // §4.4: лимит токенов/секунд на тенант исчерпан, повторно подберётся в новом месяце

/**
 * Кастомная ошибка для случаев когда у звонка нет файла записи.
 * Воркер ловит её отдельно и помечает звонок как no_recording (не failed),
 * чтобы такие звонки не считались техническими сбоями и периодически
 * перепроверялись (запись может подгрузиться с задержкой).
 */
export class NoRecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRecordingError";
  }
}

// §2 + §3 MASTER-TZ: единая сущность взаимодействия.
// Имя таблицы оставляем `calls` для обратной совместимости с существующим кодом;
// конкретный тип определяется колонкой interaction_type.
export type InteractionType = "call" | "chat" | "email" | "meeting";
export type InteractionChannel =
  | "bitrix_telephony"
  | "openlines"
  | "whatsapp"
  | "telegram"
  | "email_imap"
  | "manual"
  | "zoom"
  | "yandex_telemost"
  | "dictaphone"
  | "other";

export interface CallRow {
  id: number;
  tenant_id: number | null;
  interaction_type: InteractionType;
  channel: InteractionChannel;
  content_text: string | null;  // для chat/email — готовый текст переписки
  bitrix_call_id: string | null;
  bitrix_deal_id: string | null;
  bitrix_lead_id: string | null;
  bitrix_contact_id: string | null;
  bitrix_activity_id: string | null;
  // Bitrix enrich: догружаемые названия CRM-сущностей + базовый URL портала
  bitrix_deal_title: string | null;
  bitrix_lead_title: string | null;
  bitrix_contact_name: string | null;
  bitrix_portal_url: string | null;
  manager_id: string | null;
  manager_name: string | null;
  client_phone: string | null;
  direction: "in" | "out" | null;
  started_at: string | null;
  duration_sec: number;
  recording_url: string | null;
  recording_path: string | null;
  status: CallStatus;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface AnalysisRow {
  call_id: number;
  summary: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  manager_score: number | null;
  script_compliance: number | null;
  next_action: string | null;
  objections_json: string | null;
  topics_json: string | null;
  raw_json: string | null;
  model: string | null;
  created_at: string;
  client_name: string | null;
  checklist_scores_json: string | null;
  coaching_tips_json: string | null;  // §5.2 MASTER-TZ
}

export interface TranscriptRow {
  call_id: number;
  text: string;
  segments_json: string | null;
  dialogue_json: string | null;
  language: string | null;
  model: string | null;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  title: string;
  weight: number;        // 1..5
  description?: string;
  block?: string;        // блок-категория (например «Установление контакта», «Презентация продукта»)
}

export interface ChecklistItemScore {
  id: string;
  title: string;
  score: number;         // 0..1
  notes: string;
}

export interface DialogueTurn {
  speaker: "manager" | "client" | "unknown";
  text: string;
  start?: number;
  end?: number;
}

export async function setCallStatus(callId: number, status: CallStatus, error?: string): Promise<void> {
  const { getDbAsync } = await import("./db-compat");
  await getDbAsync().prepare(
    `UPDATE calls SET status = ?, error = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, error ?? null, callId);
}

export async function getSetting(key: string): Promise<string | null> {
  const { getDbAsync } = await import("./db-compat");
  const row = await getDbAsync()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get<{ value: string }>(key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { getDbAsync } = await import("./db-compat");
  await getDbAsync()
    .prepare(
      `INSERT INTO settings(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
}
