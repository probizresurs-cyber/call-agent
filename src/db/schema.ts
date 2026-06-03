/**
 * Drizzle ORM schema — Postgres.
 *
 * Зеркало текущей SQLite-схемы, но:
 *  - JSON-поля → jsonb (вместо TEXT)
 *  - Все даты → timestamptz
 *  - Booleans → boolean (вместо INTEGER 0/1)
 *  - Идентификаторы → bigserial (вместо INTEGER PRIMARY KEY AUTOINCREMENT)
 *
 * Multi-tenant с первого дня: tenant_id на всех доменных таблицах.
 * Подготовлено к Phase 1+ ТЗ: добавлены задел-поля для interactions (channel/type)
 * но пока имя таблицы остаётся `calls` — переименование в `interactions` будет
 * отдельным шагом миграции с добавлением новых типов (chat/email/meeting).
 */
import {
  pgTable, bigserial, bigint, varchar, text, timestamp, integer,
  doublePrecision, boolean, jsonb, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ──────────────────────────────────────────────────────────────────────
// Tenants (организация-арендатор)

export const tenants = pgTable("tenants", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 64 }).unique(),
  isActive: boolean("is_active").notNull().default(true),
  // настройки тенанта (бюджет, retention, флаги интеграций)
  settings: jsonb("settings").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────
// Users (пользователи платформы)

export type UserRole = "owner" | "admin" | "head" | "manager";

export const users = pgTable(
  "users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    login: varchar("login", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 16 }).notNull().default("manager").$type<UserRole>(),
    name: text("name"),
    email: varchar("email", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    // Привязка к Bitrix-менеджеру для роли 'manager' (видит свои звонки)
    bitrixManagerId: varchar("bitrix_manager_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantLogin: uniqueIndex("users_tenant_login_idx").on(t.tenantId, t.login),
    bitrixIdx: index("users_bitrix_idx").on(t.bitrixManagerId),
    roleIdx: index("users_tenant_role_idx").on(t.tenantId, t.role),
  })
);

// ──────────────────────────────────────────────────────────────────────
// Sessions

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 128 }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "cascade" }),
    tenantId: bigint("tenant_id", { mode: "number" }).references(() => tenants.id, { onDelete: "cascade" }),
    // Legacy login для совместимости со старыми сессиями
    legacyLogin: varchar("legacy_login", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  })
);

// ──────────────────────────────────────────────────────────────────────
// Managers (менеджеры из Bitrix, кэш для отображения)

export const managers = pgTable("managers", {
  // Bitrix user ID, остаётся строкой для совместимости
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name"),
  email: varchar("email", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────
// Sales scripts + checklists

export type ChecklistItem = {
  id: string;
  title: string;
  weight: number;
  description?: string;
  block?: string;
};

export const salesScripts = pgTable("sales_scripts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  product: varchar("product", { length: 32 }),       // 'МП', 'МК' или null (общий)
  direction: varchar("direction", { length: 8 }).notNull().default("all"), // 'in' | 'out' | 'all'
  contentMd: text("content_md").notNull().default(""),
  checklist: jsonb("checklist").$type<ChecklistItem[]>().default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────
// Calls (будет переименовано в `interactions` в следующей фазе)

export type CallStatus =
  | "pending" | "downloading" | "transcribing" | "analyzing" | "syncing"
  | "done" | "failed" | "no_recording";

export const calls = pgTable(
  "calls",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    // Привязка к пользователю платформы (опционально, заполнится автоматически по bitrix_manager_id)
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),

    // Источник — пока всегда 'bitrix_telephony', в будущем будут 'whatsapp', 'email' и т.д.
    channel: varchar("channel", { length: 32 }).notNull().default("bitrix_telephony"),
    // Тип взаимодействия — задел для omnichannel
    type: varchar("type", { length: 16 }).notNull().default("call"),  // 'call' | 'chat' | 'email' | 'meeting'

    // Bitrix-идентификаторы
    bitrixCallId: varchar("bitrix_call_id", { length: 128 }).unique(),
    bitrixDealId: varchar("bitrix_deal_id", { length: 64 }),
    bitrixLeadId: varchar("bitrix_lead_id", { length: 64 }),
    bitrixContactId: varchar("bitrix_contact_id", { length: 64 }),
    bitrixActivityId: varchar("bitrix_activity_id", { length: 64 }),
    // Bitrix enrich: догружаемые названия CRM-сущностей + базовый URL портала.
    // Заполняются в pipeline после получения deal_id/lead_id/contact_id.
    bitrixDealTitle: text("bitrix_deal_title"),
    bitrixLeadTitle: text("bitrix_lead_title"),
    bitrixContactName: text("bitrix_contact_name"),
    bitrixPortalUrl: text("bitrix_portal_url"),

    // Менеджер (из Bitrix)
    managerId: varchar("manager_id", { length: 64 }),
    managerName: text("manager_name"),

    // Содержание
    clientPhone: varchar("client_phone", { length: 64 }),
    direction: varchar("direction", { length: 4 }),  // 'in' | 'out' | null
    startedAt: timestamp("started_at", { withTimezone: true }),
    durationSec: integer("duration_sec").notNull().default(0),
    recordingUrl: text("recording_url"),
    recordingPath: text("recording_path"),

    // Pipeline state
    status: varchar("status", { length: 16 }).notNull().default("pending").$type<CallStatus>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),

    // AI-определённый продукт (МП/МК)
    detectedProduct: varchar("detected_product", { length: 32 }),

    // Свёртка контекста сделки из Bitrix на момент анализа
    dealContext: jsonb("deal_context").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("calls_status_idx").on(t.status),
    startedAtIdx: index("calls_started_at_idx").on(t.startedAt),
    managerIdx: index("calls_manager_idx").on(t.managerId),
    tenantStartedIdx: index("calls_tenant_started_idx").on(t.tenantId, t.startedAt),
    tenantManagerIdx: index("calls_tenant_manager_idx").on(t.tenantId, t.managerId),
  })
);

// ──────────────────────────────────────────────────────────────────────
// Transcripts (1:1 с calls)

export type DialogueTurn = {
  speaker: "manager" | "client" | "unknown";
  text: string;
  start?: number;
  end?: number;
};

export const transcripts = pgTable("transcripts", {
  callId: bigint("call_id", { mode: "number" }).primaryKey().references(() => calls.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  segments: jsonb("segments").$type<Array<{ start: number; end: number; text: string }>>(),
  dialogue: jsonb("dialogue").$type<DialogueTurn[]>(),
  language: varchar("language", { length: 8 }),
  model: varchar("model", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────
// Analyses (1:1 с calls)

export type ChecklistItemScore = {
  id: string;
  title: string;
  score: number;
  notes: string;
  block?: string;
};

export const analyses = pgTable("analyses", {
  callId: bigint("call_id", { mode: "number" }).primaryKey().references(() => calls.id, { onDelete: "cascade" }),
  summary: text("summary"),
  sentiment: varchar("sentiment", { length: 16 }),  // positive | neutral | negative
  managerScore: doublePrecision("manager_score"),    // 0..10
  scriptCompliance: doublePrecision("script_compliance"),  // 0..1
  nextAction: text("next_action"),
  objections: jsonb("objections").$type<string[]>(),
  topics: jsonb("topics").$type<string[]>(),
  checklistScores: jsonb("checklist_scores").$type<ChecklistItemScore[]>(),
  clientName: text("client_name"),
  detectedProduct: varchar("detected_product", { length: 32 }),
  // Сырой ответ модели — для дебага
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  model: varchar("model", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────
// Settings (key/value per tenant)
// Пока без tenant_id для обратной совместимости (одна общая инстанция)
// На Phase 0 расширится до per-tenant settings

export const settings = pgTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value"),
  tenantId: bigint("tenant_id", { mode: "number" }).references(() => tenants.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────
// Outbox events (для будущей синхронизации с Company24 Core)
// Создаём заранее, чтобы запись event-ов уже шла с первого дня

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),  // 'call.analyzed', 'reminder.created', etc.
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    // 'pending' пока не доставлено, 'sent' — отправлено в Core, 'failed' — error
    deliveryStatus: varchar("delivery_status", { length: 16 }).notNull().default("pending"),
    deliveryError: text("delivery_error"),
    deliveryAttempts: integer("delivery_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => ({
    deliveryIdx: index("events_delivery_idx").on(t.deliveryStatus, t.createdAt),
    tenantIdx: index("events_tenant_idx").on(t.tenantId, t.createdAt),
  })
);

// ──────────────────────────────────────────────────────────────────────
// Reminders (задел для AI-РОПа)

export const reminders = pgTable(
  "reminders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, { onDelete: "cascade" }),
    callId: bigint("call_id", { mode: "number" }).references(() => calls.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    // 'open', 'done', 'cancelled', 'overdue'
    status: varchar("status", { length: 16 }).notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userStatusIdx: index("reminders_user_status_idx").on(t.userId, t.status),
    dueIdx: index("reminders_due_idx").on(t.dueAt),
  })
);
