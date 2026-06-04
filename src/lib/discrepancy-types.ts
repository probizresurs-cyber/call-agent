/**
 * Типы для модуля «AI-проверка карточки CRM» (discrepancy detector).
 *
 * Модуль сравнивает поля карточки Bitrix (deal/lead/contact) со стенограммой
 * звонка и формирует список расхождений, которые потом попадают либо в ЛК
 * ответственного менеджера, либо в инбокс РОПа/админов — в зависимости от
 * настроек тенанта (tenants.discrepancy_recipient_mode).
 *
 * Сами настройки и записи о расхождениях хранятся в Postgres:
 *  - tenants.discrepancy_* — см. db/schema.ts (6 полей)
 *  - card_discrepancies      — см. db/schema.ts (отдельная таблица)
 */

// ──────────────────────────────────────────────────────────────
// Перечисления

/** Куда роутить найденные расхождения */
export type DiscrepancyRecipientMode = "manager" | "admins";

/** Что делать получателю */
export type DiscrepancyActionMode = "manual" | "auto_approve";

/** Степень критичности расхождения */
export type DiscrepancySeverity = "low" | "medium" | "high";

/** Жизненный цикл записи о расхождении */
export type DiscrepancyStatus =
  | "pending"        // только что найдено, ждёт реакции
  | "accepted"       // получатель подтвердил — AI применит правку в Bitrix
  | "rejected"       // получатель отклонил — закрываем без изменений
  | "manual_fixed"   // получатель сам внёс правку в карточку CRM
  | "auto_applied";  // AI уже записал значение в Bitrix (auto_approve режим)

// ──────────────────────────────────────────────────────────────
// Per-tenant настройки модуля.
// В БД это 6 колонок tenants.discrepancy_*; здесь — удобная форма для UI.

export interface TenantDiscrepancySettings {
  /** Включён ли модуль для тенанта */
  enabled: boolean;
  /** Куда падают расхождения */
  recipientMode: DiscrepancyRecipientMode;
  /** Список user.id (пусто если recipientMode='manager') */
  adminUserIds: number[];
  /** Что делать получателю с находкой */
  actionMode: DiscrepancyActionMode;
  /** Whitelist UF_CRM_* полей; null = проверять все UF_CRM_* */
  customFields: string[] | null;
  /** Минимальный показываемый порог severity */
  severityMin: DiscrepancySeverity;
}

// ──────────────────────────────────────────────────────────────
// Запись о найденном расхождении.
// Имена полей — snake_case под колонки card_discrepancies для удобства
// прямой передачи row-объектов из getDbAsync().prepare(...).get<CardDiscrepancy>().

export interface CardDiscrepancy {
  id: number;
  tenant_id: number;
  call_id: number;
  entity_type: "deal" | "lead" | "contact" | null;
  entity_id: string | null;
  field_name: string;
  field_label: string | null;
  card_value: string | null;
  transcript_evidence: string | null;
  suggested_value: string | null;
  severity: DiscrepancySeverity;
  status: DiscrepancyStatus;
  routed_to_user_id: number | null;
  ai_model: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: number | null;
}
