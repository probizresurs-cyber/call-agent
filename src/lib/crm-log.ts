/**
 * §5.5 + §9 MASTER-TZ — лог CRM-write операций.
 *
 * Записываем КАЖДОЕ намерение что-то отправить в CRM (даже dry-run).
 * Это даёт:
 *   - идемпотентность (не отправить одно и то же дважды)
 *   - прозрачность для РОПа (видно что бы ушло)
 *   - аудит (что было реально отправлено)
 *
 * Таблица создаётся лениво (CREATE TABLE IF NOT EXISTS) на первое обращение.
 */
import { getDbAsync } from "./db-compat";

export type CrmAction = "comment" | "task" | "activity_update";
export type CrmMode = "dry" | "live";
export type CrmStatus = "queued" | "sent" | "failed" | "skipped_dry";

export interface CrmLogEntry {
  id: number;
  tenant_id: number;
  call_id: number;
  action: CrmAction;
  entity_type: string | null;   // 'deal' / 'lead' / 'contact' / 'activity'
  entity_id: string | null;
  mode: CrmMode;
  status: CrmStatus;
  payload_json: string;          // JSON.stringify полезной нагрузки
  result_json: string | null;    // ответ Bitrix или ошибка
  idempotency_key: string;       // SHA-фрагмент от (call_id + action + entity) — для дедупа
  created_at: string;
}

let _tableReady = false;
async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  const db = getDbAsync();
  // Пробуем PG-синтаксис, fallback на SQLite (как в budget.ts)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS crm_write_log (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      call_id INTEGER NOT NULL,
      action VARCHAR(32) NOT NULL,
      entity_type VARCHAR(32),
      entity_id VARCHAR(64),
      mode VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL,
      payload_json TEXT NOT NULL,
      result_json TEXT,
      idempotency_key VARCHAR(128) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS crm_log_call_idx ON crm_write_log(call_id, action);
    CREATE INDEX IF NOT EXISTS crm_log_idemp_idx ON crm_write_log(idempotency_key);
    CREATE INDEX IF NOT EXISTS crm_log_tenant_at_idx ON crm_write_log(tenant_id, created_at);
  `).catch(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS crm_write_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        call_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        result_json TEXT,
        idempotency_key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS crm_log_call_idx ON crm_write_log(call_id, action);
      CREATE INDEX IF NOT EXISTS crm_log_idemp_idx ON crm_write_log(idempotency_key);
      CREATE INDEX IF NOT EXISTS crm_log_tenant_at_idx ON crm_write_log(tenant_id, created_at);
    `);
  });
  _tableReady = true;
}

/**
 * Уникальный ключ для идемпотентности: один call + одно action + один entity = одна запись live.
 * Dry-run может повторяться много раз — дедупим только 'live'.
 */
export function makeIdempotencyKey(callId: number, action: CrmAction, entityType: string | null, entityId: string | null): string {
  return `${callId}:${action}:${entityType ?? "_"}:${entityId ?? "_"}`;
}

/**
 * Уже отправляли это live? (для дедупа перед live-вызовом)
 */
export async function alreadySentLive(idempotencyKey: string): Promise<boolean> {
  await ensureTable();
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT id FROM crm_write_log WHERE idempotency_key = ? AND mode = 'live' AND status = 'sent' LIMIT 1`)
    .get(idempotencyKey);
  return !!row;
}

export async function logCrmWrite(args: {
  tenantId: number;
  callId: number;
  action: CrmAction;
  entityType: string | null;
  entityId: string | null;
  mode: CrmMode;
  status: CrmStatus;
  payload: unknown;
  result?: unknown;
}): Promise<number | undefined> {
  await ensureTable();
  const db = getDbAsync();
  const key = makeIdempotencyKey(args.callId, args.action, args.entityType, args.entityId);
  const r = await db
    .prepare(
      `INSERT INTO crm_write_log
       (tenant_id, call_id, action, entity_type, entity_id, mode, status, payload_json, result_json, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.tenantId, args.callId, args.action,
      args.entityType, args.entityId,
      args.mode, args.status,
      JSON.stringify(args.payload),
      args.result == null ? null : JSON.stringify(args.result),
      key
    );
  return r.lastInsertRowid as number | undefined;
}

/** Лог за период — для страницы /crm-log */
export async function listCrmLog(args: { tenantId: number; limit?: number; mode?: CrmMode }): Promise<CrmLogEntry[]> {
  await ensureTable();
  const db = getDbAsync();
  const limit = args.limit ?? 100;
  if (args.mode) {
    return await db
      .prepare(
        `SELECT * FROM crm_write_log WHERE tenant_id = ? AND mode = ? ORDER BY id DESC LIMIT ?`
      )
      .all<CrmLogEntry>(args.tenantId, args.mode, limit);
  }
  return await db
    .prepare(`SELECT * FROM crm_write_log WHERE tenant_id = ? ORDER BY id DESC LIMIT ?`)
    .all<CrmLogEntry>(args.tenantId, limit);
}
