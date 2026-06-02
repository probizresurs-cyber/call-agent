/**
 * §3.5 MASTER-TZ — единый контракт адаптера источника взаимодействий.
 *
 * Цель: добавление нового канала (Bitrix Open Lines, IMAP, Zoom cloud, Telegram Bot)
 * не должно требовать переписывания pipeline/analyzer. Каждый адаптер реализует
 * этот интерфейс и регистрируется в registry.
 *
 * Текущие адаптеры:
 *   - BitrixCallsAdapter (см. lib/importer.ts — рефактор позже, сейчас работает напрямую)
 *   - ManualUploadAdapter (см. этот файл) — ручная загрузка чата/email/встречи через UI
 *
 * Будущие (отдельные итерации, не сейчас):
 *   - BitrixOpenLinesAdapter (чаты WhatsApp/Telegram/VK через открытые линии Bitrix)
 *   - ImapAdapter (email)
 *   - S3WatcherAdapter (записи встреч из облачной папки)
 *   - ZoomCloudAdapter (записи Zoom)
 */
import { getDbAsync } from "./db-compat";
import type { InteractionType, InteractionChannel } from "./db";

/**
 * Нормализованная запись для вставки в calls (= interactions).
 * Адаптер сам решает как маппить данные источника в эти поля.
 */
export interface NormalizedInteraction {
  // Идентификатор в источнике (для идемпотентности).
  // Для Bitrix calls — bitrix_call_id. Для ручной загрузки — генерим UUID.
  // Один и тот же external_id из одного source НЕ создаст дубль.
  externalId: string;

  tenantId: number;
  type: InteractionType;
  channel: InteractionChannel;
  direction?: "in" | "out" | null;

  // Кто из менеджеров (Bitrix user ID если есть, иначе null)
  managerId?: string | null;
  managerName?: string | null;

  // Контактные данные клиента
  clientPhone?: string | null;
  clientName?: string | null;

  // CRM-привязка (если адаптер её знает)
  bitrixDealId?: string | null;
  bitrixLeadId?: string | null;
  bitrixContactId?: string | null;
  bitrixActivityId?: string | null;

  // Временные характеристики
  startedAt?: string | null;     // ISO timestamp
  durationSec?: number;          // 0 для chat/email

  // Контент: либо ссылка на аудио (для call/meeting), либо готовый текст
  recordingUrl?: string | null;
  contentText?: string | null;

  // Стартовый статус. По умолчанию 'pending' (запустить обработку).
  initialStatus?: string;
}

/**
 * Контракт адаптера источника. Минимум — normalize+save. fetch опционален
 * (для адаптеров с пуллингом по расписанию, например IMAP/S3-watcher).
 */
export interface SourceAdapter {
  /** Уникальный slug адаптера, попадает в БД и логи */
  readonly channel: InteractionChannel;
  /** Человеческое имя для UI */
  readonly displayName: string;

  /**
   * Сохранить нормализованную запись в calls (если ещё нет).
   * Идемпотентно по (channel, externalId).
   * Возвращает callId если создал/обновил, null если пропустил (дубль).
   */
  save(normalized: NormalizedInteraction): Promise<number | null>;

  /**
   * Опциональная выборка из источника (для пуллинговых адаптеров).
   * Адаптеры без fetch (Webhook, Manual) могут не реализовывать.
   */
  fetch?(opts: { since?: string; tenantId: number }): Promise<NormalizedInteraction[]>;
}

/**
 * Базовая реализация save — общая для всех адаптеров.
 * Использует составной идемпотентный ключ (channel:externalId).
 * Если запись существует — возвращает null, иначе создаёт и возвращает callId.
 */
export async function saveInteraction(n: NormalizedInteraction): Promise<number | null> {
  const db = getDbAsync();

  // Проверка дубля. Для bitrix_telephony используем bitrix_call_id (старый ключ),
  // для остальных — composite key channel:externalId в bitrix_call_id поле
  // (оно у нас UNIQUE и так удобно переиспользовать).
  const externalKey = n.channel === "bitrix_telephony"
    ? n.externalId
    : `${n.channel}:${n.externalId}`;

  const existing = await db
    .prepare(`SELECT id FROM calls WHERE bitrix_call_id = ? LIMIT 1`)
    .get<{ id: number }>(externalKey);
  if (existing) return null;

  const r = await db
    .prepare(
      `INSERT INTO calls (
         tenant_id, interaction_type, channel, content_text,
         bitrix_call_id, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id,
         bitrix_activity_id, manager_id, manager_name, client_phone,
         direction, started_at, duration_sec, recording_url, status, attempts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      n.tenantId,
      n.type,
      n.channel,
      n.contentText ?? null,
      externalKey,
      n.bitrixDealId ?? null,
      n.bitrixLeadId ?? null,
      n.bitrixContactId ?? null,
      n.bitrixActivityId ?? null,
      n.managerId ?? null,
      n.managerName ?? null,
      n.clientPhone ?? null,
      n.direction ?? null,
      n.startedAt ?? null,
      n.durationSec ?? 0,
      n.recordingUrl ?? null,
      n.initialStatus ?? "pending",
      0
    );
  return r.lastInsertRowid as number | undefined ?? null;
}

/**
 * Ручная загрузка из UI — без auth/fetch, только save.
 * externalId генерится клиентом (UUID) при создании.
 */
export class ManualUploadAdapter implements SourceAdapter {
  readonly channel: InteractionChannel = "manual";
  readonly displayName = "Ручная загрузка";

  async save(n: NormalizedInteraction): Promise<number | null> {
    return saveInteraction({ ...n, channel: n.channel || "manual" });
  }
}
