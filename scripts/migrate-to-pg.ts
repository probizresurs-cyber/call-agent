/**
 * Миграция данных SQLite → Postgres.
 *
 * Использование:
 *   pnpm db:push                  # сначала создаём схему в Postgres
 *   pnpm db:migrate-data          # затем переносим данные
 *   pnpm db:migrate-data --dry    # dry-run: показывает что бы перенеслось
 *   pnpm db:migrate-data --truncate  # перед миграцией очистить таблицы (DEV ONLY)
 *
 * ID сохраняются 1-в-1. После миграции в Postgres последовательности
 * перенастраиваются на (max(id) + 1).
 *
 * Безопасно к повторному запуску — используется UPSERT (ON CONFLICT).
 */
import path from "path";
import { loadEnv } from "../src/lib/loadEnv";
loadEnv(path.join(__dirname, ".."));

import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { getPg, closePg } from "../src/db/pg";
import * as s from "../src/db/schema";

const DRY = process.argv.includes("--dry");
const TRUNCATE = process.argv.includes("--truncate");

const SQLITE_PATH = path.join(__dirname, "..", "data", "call-agent.db");

interface Stats { table: string; sqlite: number; copied: number; skipped: number }
const stats: Stats[] = [];

async function main() {
  console.log(`[migrate] SQLite: ${SQLITE_PATH}`);
  console.log(`[migrate] Postgres: ${maskPgUrl()}`);
  console.log(`[migrate] dry=${DRY}, truncate=${TRUNCATE}`);

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pg = getPg();

  if (TRUNCATE && !DRY) {
    console.log("\n⚠ TRUNCATE: очищаем все таблицы перед миграцией…");
    // Порядок важен из-за FK
    await pg.execute(sql`TRUNCATE
      reminders, events, analyses, transcripts, calls,
      sales_scripts, managers, sessions, users, tenants, settings
      RESTART IDENTITY CASCADE`);
  }

  // 1. Tenants
  await migrateTenants(sqlite, pg);
  // 2. Users
  await migrateUsers(sqlite, pg);
  // 3. Managers
  await migrateManagers(sqlite, pg);
  // 4. Sales scripts
  await migrateScripts(sqlite, pg);
  // 5. Settings
  await migrateSettings(sqlite, pg);
  // 6. Calls
  await migrateCalls(sqlite, pg);
  // 7. Transcripts
  await migrateTranscripts(sqlite, pg);
  // 8. Analyses
  await migrateAnalyses(sqlite, pg);
  // 9. Sessions — пропускаем (после миграции все юзеры перелогинятся)
  console.log("\n[migrate] sessions — пропущены (юзеры перелогинятся)");

  // 10. Перенастроить последовательности
  if (!DRY) await resetSequences(pg);

  console.log("\n══════════ ИТОГО ══════════");
  console.table(stats);
  console.log(DRY ? "\n[migrate] DRY-RUN — данные НЕ записаны" : "\n[migrate] ✓ готово");

  sqlite.close();
  await closePg();
}

function maskPgUrl(): string {
  const u = process.env.DATABASE_URL || "(нет)";
  return u.replace(/:[^:@]+@/, ":***@");
}

function jsonOrNull(s: string | null | undefined): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function tsToIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  // SQLite хранит как "YYYY-MM-DD HH:MM:SS" или ISO — Date() справится с обоими
  const cleaned = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────────────────────

async function migrateTenants(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM tenants ORDER BY id`).all() as Array<{
    id: number; name: string; slug: string | null;
    is_active: number; settings_json: string | null; created_at: string;
  }>;
  let copied = 0;
  for (const r of rows) {
    if (DRY) { copied++; continue; }
    await pg.insert(s.tenants).values({
      id: r.id, name: r.name, slug: r.slug,
      isActive: !!r.is_active,
      settings: (jsonOrNull(r.settings_json) as Record<string, unknown>) ?? {},
      createdAt: tsToIso(r.created_at) ?? new Date(),
    }).onConflictDoNothing();
    copied++;
  }
  stats.push({ table: "tenants", sqlite: rows.length, copied, skipped: 0 });
}

async function migrateUsers(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM users ORDER BY id`).all() as Array<{
    id: number; tenant_id: number; login: string; password_hash: string;
    role: "owner" | "admin" | "head" | "manager"; name: string | null;
    email: string | null; is_active: number; bitrix_manager_id: string | null;
    created_at: string; updated_at: string;
  }>;
  let copied = 0;
  for (const r of rows) {
    if (DRY) { copied++; continue; }
    await pg.insert(s.users).values({
      id: r.id, tenantId: r.tenant_id, login: r.login,
      passwordHash: r.password_hash, role: r.role, name: r.name, email: r.email,
      isActive: !!r.is_active, bitrixManagerId: r.bitrix_manager_id,
      createdAt: tsToIso(r.created_at) ?? new Date(),
      updatedAt: tsToIso(r.updated_at) ?? new Date(),
    }).onConflictDoNothing();
    copied++;
  }
  stats.push({ table: "users", sqlite: rows.length, copied, skipped: 0 });
}

async function migrateManagers(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM managers ORDER BY id`).all() as Array<{
    id: string; tenant_id: number; name: string | null; email: string | null;
    is_active: number; updated_at: string;
  }>;
  let copied = 0;
  for (const r of rows) {
    if (DRY) { copied++; continue; }
    await pg.insert(s.managers).values({
      id: r.id, tenantId: r.tenant_id, name: r.name, email: r.email,
      isActive: !!r.is_active,
      updatedAt: tsToIso(r.updated_at) ?? new Date(),
    }).onConflictDoNothing();
    copied++;
  }
  stats.push({ table: "managers", sqlite: rows.length, copied, skipped: 0 });
}

async function migrateScripts(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM sales_scripts ORDER BY id`).all() as Array<{
    id: number; tenant_id: number; name: string; product: string | null;
    direction: string | null; content_md: string;
    checklist_json: string | null; is_active: number; updated_at: string;
  }>;
  let copied = 0;
  for (const r of rows) {
    if (DRY) { copied++; continue; }
    await pg.insert(s.salesScripts).values({
      id: r.id, tenantId: r.tenant_id, name: r.name,
      product: r.product, direction: r.direction || "all",
      contentMd: r.content_md || "",
      checklist: (jsonOrNull(r.checklist_json) as s.ChecklistItem[]) ?? [],
      isActive: !!r.is_active,
      updatedAt: tsToIso(r.updated_at) ?? new Date(),
    }).onConflictDoNothing();
    copied++;
  }
  stats.push({ table: "sales_scripts", sqlite: rows.length, copied, skipped: 0 });
}

async function migrateSettings(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM settings`).all() as Array<{ key: string; value: string }>;
  let copied = 0;
  for (const r of rows) {
    if (DRY) { copied++; continue; }
    await pg.insert(s.settings).values({
      key: r.key, value: r.value, tenantId: 1,
    }).onConflictDoNothing();
    copied++;
  }
  stats.push({ table: "settings", sqlite: rows.length, copied, skipped: 0 });
}

async function migrateCalls(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM calls ORDER BY id`).all() as Array<{
    id: number; tenant_id: number; user_id: number | null;
    bitrix_call_id: string | null; bitrix_deal_id: string | null;
    bitrix_lead_id: string | null; bitrix_contact_id: string | null;
    bitrix_activity_id: string | null; manager_id: string | null;
    manager_name: string | null; client_phone: string | null;
    direction: string | null; started_at: string | null; duration_sec: number;
    recording_url: string | null; recording_path: string | null;
    status: s.CallStatus; error: string | null; attempts: number;
    detected_product: string | null; deal_context_json: string | null;
    created_at: string; updated_at: string;
  }>;
  let copied = 0;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    if (DRY) { copied += chunk.length; continue; }
    await pg.insert(s.calls).values(chunk.map((r) => ({
      id: r.id, tenantId: r.tenant_id || 1,
      userId: r.user_id, channel: "bitrix_telephony", type: "call",
      bitrixCallId: r.bitrix_call_id, bitrixDealId: r.bitrix_deal_id,
      bitrixLeadId: r.bitrix_lead_id, bitrixContactId: r.bitrix_contact_id,
      bitrixActivityId: r.bitrix_activity_id, managerId: r.manager_id,
      managerName: r.manager_name, clientPhone: r.client_phone,
      direction: r.direction, startedAt: tsToIso(r.started_at),
      durationSec: r.duration_sec || 0, recordingUrl: r.recording_url,
      recordingPath: r.recording_path, status: r.status,
      error: r.error, attempts: r.attempts || 0,
      detectedProduct: r.detected_product,
      dealContext: jsonOrNull(r.deal_context_json) as Record<string, unknown> | null,
      createdAt: tsToIso(r.created_at) ?? new Date(),
      updatedAt: tsToIso(r.updated_at) ?? new Date(),
    }))).onConflictDoNothing();
    copied += chunk.length;
    if (rows.length > 200) process.stdout.write(`\r  calls: ${copied}/${rows.length}`);
  }
  if (rows.length > 200) console.log("");
  stats.push({ table: "calls", sqlite: rows.length, copied, skipped: 0 });
}

async function migrateTranscripts(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM transcripts`).all() as Array<{
    call_id: number; text: string; segments_json: string | null;
    dialogue_json: string | null; language: string | null; model: string | null;
    created_at: string;
  }>;
  let copied = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    if (DRY) { copied += chunk.length; continue; }
    await pg.insert(s.transcripts).values(chunk.map((r) => ({
      callId: r.call_id, text: r.text || "",
      segments: jsonOrNull(r.segments_json) as Array<{start:number;end:number;text:string}> | null,
      dialogue: jsonOrNull(r.dialogue_json) as s.DialogueTurn[] | null,
      language: r.language, model: r.model,
      createdAt: tsToIso(r.created_at) ?? new Date(),
    }))).onConflictDoNothing();
    copied += chunk.length;
    if (rows.length > 100) process.stdout.write(`\r  transcripts: ${copied}/${rows.length}`);
  }
  if (rows.length > 100) console.log("");
  stats.push({ table: "transcripts", sqlite: rows.length, copied, skipped: 0 });
}

async function migrateAnalyses(sqlite: Database.Database, pg: ReturnType<typeof getPg>) {
  const rows = sqlite.prepare(`SELECT * FROM analyses`).all() as Array<{
    call_id: number; summary: string | null; sentiment: string | null;
    manager_score: number | null; script_compliance: number | null;
    next_action: string | null; objections_json: string | null;
    topics_json: string | null; raw_json: string | null; model: string | null;
    client_name: string | null; checklist_scores_json: string | null;
    detected_product: string | null; created_at: string;
  }>;
  let copied = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    if (DRY) { copied += chunk.length; continue; }
    await pg.insert(s.analyses).values(chunk.map((r) => ({
      callId: r.call_id, summary: r.summary, sentiment: r.sentiment,
      managerScore: r.manager_score, scriptCompliance: r.script_compliance,
      nextAction: r.next_action,
      objections: jsonOrNull(r.objections_json) as string[] | null,
      topics: jsonOrNull(r.topics_json) as string[] | null,
      checklistScores: jsonOrNull(r.checklist_scores_json) as s.ChecklistItemScore[] | null,
      clientName: r.client_name, detectedProduct: r.detected_product,
      raw: jsonOrNull(r.raw_json) as Record<string, unknown> | null,
      model: r.model,
      createdAt: tsToIso(r.created_at) ?? new Date(),
    }))).onConflictDoNothing();
    copied += chunk.length;
    if (rows.length > 100) process.stdout.write(`\r  analyses: ${copied}/${rows.length}`);
  }
  if (rows.length > 100) console.log("");
  stats.push({ table: "analyses", sqlite: rows.length, copied, skipped: 0 });
}

async function resetSequences(pg: ReturnType<typeof getPg>) {
  console.log("\n[migrate] перенастройка последовательностей…");
  // Для всех таблиц с bigserial — устанавливаем next_val = max(id) + 1
  for (const t of ["tenants", "users", "calls", "sales_scripts", "events", "reminders"]) {
    await pg.execute(sql.raw(
      `SELECT setval(pg_get_serial_sequence('"${t}"','id'),
              COALESCE((SELECT MAX(id) FROM "${t}"), 1))`
    ));
  }
}

main().catch((e) => {
  console.error("[migrate] FAIL:", e);
  process.exit(1);
});
