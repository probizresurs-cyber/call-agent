/**
 * Фаза 2 модуля «Сравнение с CRM-карточкой».
 *
 * detectDiscrepancies(callId) — запускается ПОСЛЕ analyzeCall.
 * Берёт транскрипт + карточку Bitrix, находит расхождения через AI,
 * сохраняет в card_discrepancies, маршрутизирует получателям.
 */

import { getDbAsync, type CompatDb } from "@/lib/db-compat";
import { callWithTool } from "@/lib/ai-provider";
import {
  crmDealGet,
  crmLeadGet,
  callBitrixApi,
} from "@/lib/bitrix";
import type {
  DiscrepancySeverity,
  TenantDiscrepancySettings,
} from "@/lib/discrepancy-types";
import { isDryRunForTenant } from "./flags";

// ──────────────────────────────────────────────────────────────
// Внутренние типы

interface CallData {
  id: number;
  tenant_id: number;
  manager_id: string | null;
  bitrix_deal_id: string | null;
  bitrix_lead_id: string | null;
  bitrix_contact_id: string | null;
  transcript: string | null;
  summary: string | null;
  client_name: string | null;
  next_action: string | null;
  topics_json: string | null;
  objections_json: string | null;
}

interface TenantSettings {
  discrepancy_enabled: number | boolean;
  discrepancy_recipient_mode: string | null;
  discrepancy_admin_user_ids: string | null;
  discrepancy_action_mode: string | null;
  discrepancy_custom_fields: string | null;
  discrepancy_severity_min: string | null;
}

interface BitrixCardField {
  label: string;
  value: string;
}

interface BitrixCard {
  entityType: "deal" | "lead";
  entityId: string;
  fields: Record<string, BitrixCardField>;
}

interface AiDiscrepancy {
  field_name: string;
  field_label: string;
  card_value?: string;
  transcript_evidence: string;
  suggested_value: string;
  severity: DiscrepancySeverity;
  reasoning?: string;
}

// ──────────────────────────────────────────────────────────────
// Порядковые значения severity для фильтрации

const SEVERITY_ORDER: Record<DiscrepancySeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function severityAtLeast(
  actual: DiscrepancySeverity,
  min: DiscrepancySeverity
): boolean {
  return SEVERITY_ORDER[actual] >= SEVERITY_ORDER[min];
}

// ──────────────────────────────────────────────────────────────
// 1. Загрузка данных звонка

async function loadCallData(
  callId: number,
  db: CompatDb
): Promise<{ call: CallData; settings: TenantDiscrepancySettings } | null> {
  // Загружаем звонок + транскрипт + анализ одним запросом
  const row = await db
    .prepare(
      `SELECT
         c.id, c.tenant_id, c.manager_id,
         c.bitrix_deal_id, c.bitrix_lead_id, c.bitrix_contact_id,
         t.text AS transcript,
         a.summary, a.client_name, a.next_action,
         a.topics_json, a.objections_json
       FROM calls c
       LEFT JOIN transcripts t ON t.call_id = c.id
       LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.id = ?`
    )
    .get<CallData>(callId);

  if (!row) {
    console.warn(`[discrepancy] call #${callId} не найден`);
    return null;
  }

  // Загружаем настройки тенанта
  const tenant = await db
    .prepare(
      `SELECT
         discrepancy_enabled,
         discrepancy_recipient_mode,
         discrepancy_admin_user_ids,
         discrepancy_action_mode,
         discrepancy_custom_fields,
         discrepancy_severity_min
       FROM tenants WHERE id = ?`
    )
    .get<TenantSettings>(row.tenant_id);

  if (!tenant) {
    console.warn(`[discrepancy] тенант ${row.tenant_id} не найден`);
    return null;
  }

  // Проверяем флаг — если выключен, не запускаем
  const enabled = tenant.discrepancy_enabled === true || tenant.discrepancy_enabled === 1;
  if (!enabled) return null;

  // Разбираем JSON-поля настроек
  let adminUserIds: number[] = [];
  if (tenant.discrepancy_admin_user_ids) {
    try {
      adminUserIds = JSON.parse(tenant.discrepancy_admin_user_ids) as number[];
    } catch {
      adminUserIds = [];
    }
  }

  let customFields: string[] | null = null;
  if (tenant.discrepancy_custom_fields) {
    try {
      customFields = JSON.parse(tenant.discrepancy_custom_fields) as string[];
    } catch {
      customFields = null;
    }
  }

  const settings: TenantDiscrepancySettings = {
    enabled: true,
    recipientMode: (tenant.discrepancy_recipient_mode as "manager" | "admins") || "manager",
    adminUserIds,
    actionMode: (tenant.discrepancy_action_mode as "manual" | "auto_approve") || "manual",
    customFields,
    severityMin: (tenant.discrepancy_severity_min as DiscrepancySeverity) || "medium",
  };

  return { call: row, settings };
}

// ──────────────────────────────────────────────────────────────
// 2. Загрузка карточки Bitrix

async function loadBitrixCard(
  call: CallData,
  settings: TenantDiscrepancySettings
): Promise<BitrixCard | null> {
  // Предпочитаем deal над lead; если нет ни того ни другого — выходим
  const useDeal = !!call.bitrix_deal_id;
  const useLead = !useDeal && !!call.bitrix_lead_id;

  if (!useDeal && !useLead) {
    console.log(`[discrepancy] call #${call.id}: нет deal_id/lead_id — пропускаем`);
    return null;
  }

  try {
    if (useDeal) {
      // Получаем deal со всеми полями, включая UF_CRM_*
      let rawDeal: Record<string, unknown> | null = null;
      try {
        rawDeal = await callBitrixApi<Record<string, unknown>>("crm.deal.get", {
          id: call.bitrix_deal_id,
          select: ["*", "UF_*"],
        });
      } catch {
        // fallback: без select параметра
        const basic = await crmDealGet(call.bitrix_deal_id!);
        rawDeal = basic as Record<string, unknown> | null;
      }

      if (!rawDeal) {
        console.warn(`[discrepancy] deal ${call.bitrix_deal_id} не найден в Bitrix`);
        return null;
      }

      const fields = extractCardFields(rawDeal, settings.customFields);
      return {
        entityType: "deal",
        entityId: String(call.bitrix_deal_id),
        fields,
      };
    }

    // lead
    let rawLead: Record<string, unknown> | null = null;
    try {
      rawLead = await callBitrixApi<Record<string, unknown>>("crm.lead.get", {
        id: call.bitrix_lead_id,
        select: ["*", "UF_*"],
      });
    } catch {
      const basic = await crmLeadGet(call.bitrix_lead_id!);
      rawLead = basic as Record<string, unknown> | null;
    }

    if (!rawLead) {
      console.warn(`[discrepancy] lead ${call.bitrix_lead_id} не найден в Bitrix`);
      return null;
    }

    const fields = extractCardFields(rawLead, settings.customFields);
    return {
      entityType: "lead",
      entityId: String(call.bitrix_lead_id),
      fields,
    };
  } catch (e) {
    console.warn(`[discrepancy] ошибка загрузки карточки Bitrix:`, (e as Error).message);
    return null;
  }
}

/**
 * Извлекает поля карточки: стандартные + UF_CRM_* (с фильтрацией по whitelist).
 * Возвращает Record<fieldName, { label, value }>.
 */
function extractCardFields(
  raw: Record<string, unknown>,
  customFieldsWhitelist: string[] | null
): Record<string, BitrixCardField> {
  // Стандартные поля которые проверяем всегда
  const STANDARD_FIELDS: Record<string, string> = {
    TITLE: "Название",
    COMMENTS: "Комментарий",
    ADDITIONAL_INFO: "Дополнительная информация",
    OPPORTUNITY: "Сумма сделки",
    STAGE_ID: "Стадия",
    NAME: "Имя",
    LAST_NAME: "Фамилия",
    STATUS_ID: "Статус",
  };

  const fields: Record<string, BitrixCardField> = {};

  // Стандартные поля
  for (const [key, label] of Object.entries(STANDARD_FIELDS)) {
    const val = raw[key];
    if (val !== undefined && val !== null && val !== "") {
      fields[key] = { label, value: String(val) };
    }
  }

  // UF_CRM_* поля
  for (const [key, val] of Object.entries(raw)) {
    if (!key.startsWith("UF_")) continue;
    if (val === undefined || val === null || val === "") continue;

    // Если задан whitelist — берём только те поля что в нём
    if (customFieldsWhitelist && customFieldsWhitelist.length > 0) {
      if (!customFieldsWhitelist.includes(key)) continue;
    }

    const strVal = Array.isArray(val) ? val.join(", ") : String(val);
    if (strVal.trim() === "") continue;

    fields[key] = {
      label: key, // Bitrix API не возвращает label напрямую в get — используем имя поля
      value: strVal,
    };
  }

  return fields;
}

// ──────────────────────────────────────────────────────────────
// 3. AI-детекция расхождений

interface AiDetectResult {
  discrepancies: AiDiscrepancy[];
}

async function detectWithAI(
  transcript: string,
  cardFields: Record<string, BitrixCardField>,
  opts: { tenantId: number; callId: number }
): Promise<{ discrepancies: AiDiscrepancy[]; model: string }> {
  // Формируем читаемое представление карточки для промпта
  const cardLines = Object.entries(cardFields)
    .map(([key, f]) => `- ${f.label} (${key}): "${f.value}"`)
    .join("\n");

  const cardBlock = cardLines.length > 0
    ? cardLines
    : "(карточка пустая или не содержит заполненных полей)";

  const system = `Ты — эксперт по контролю качества продаж. Тебе дан транскрипт звонка менеджера с заказчиком \
и текущее содержимое CRM-карточки (сделка/лид в Bitrix24). \
Найди ТОЛЬКО ФАКТИЧЕСКИЕ расхождения: информация была упомянута в звонке, \
но отсутствует или неверно записана в карточке. \
НЕ придумывай расхождения. НЕ считай расхождением отсутствие информации которую в принципе не обсуждали. \
Верни список расхождений с конкретными цитатами из транскрипта как доказательство.`;

  const user = `## Транскрипт звонка\n\n${transcript.slice(0, 12000)}\n\n## CRM-карточка\n\n${cardBlock}`;

  const schema = {
    type: "object",
    properties: {
      discrepancies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field_name: { type: "string" },
            field_label: { type: "string" },
            card_value: { type: "string" },
            transcript_evidence: {
              type: "string",
              description: "Прямая цитата из транскрипта",
            },
            suggested_value: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            reasoning: { type: "string" },
          },
          required: [
            "field_name",
            "field_label",
            "transcript_evidence",
            "suggested_value",
            "severity",
          ],
        },
      },
    },
    required: ["discrepancies"],
  };

  const result = await callWithTool<AiDetectResult>({
    toolName: "save_discrepancies",
    schema,
    system,
    user,
    modelTier: "fast",
    maxTokens: 4000,
    tenantId: opts.tenantId,
    callId: opts.callId,
  });

  return {
    discrepancies: result.result.discrepancies ?? [],
    model: result.model,
  };
}

// ──────────────────────────────────────────────────────────────
// 4. Сохранение и маршрутизация

async function saveAndRoute(
  discrepancies: AiDiscrepancy[],
  aiModel: string,
  card: BitrixCard,
  call: CallData,
  settings: TenantDiscrepancySettings,
  db: CompatDb
): Promise<number> {
  // Фильтруем по минимальному порогу severity
  const filtered = discrepancies.filter((d) =>
    severityAtLeast(d.severity as DiscrepancySeverity, settings.severityMin)
  );

  if (filtered.length === 0) return 0;

  // Определяем routed_to_user_id
  let managerUserId: number | null = null;
  if (settings.recipientMode === "manager" && call.manager_id) {
    const userRow = await db
      .prepare(`SELECT id FROM users WHERE bitrix_manager_id = ? AND tenant_id = ? LIMIT 1`)
      .get<{ id: number }>(call.manager_id, call.tenant_id);
    managerUserId = userRow?.id ?? null;
  }

  let savedCount = 0;

  for (const d of filtered) {
    const cardValue = d.card_value ?? (card.fields[d.field_name]?.value ?? null);

    if (settings.recipientMode === "manager") {
      await db
        .prepare(
          `INSERT INTO card_discrepancies
             (tenant_id, call_id, entity_type, entity_id, field_name, field_label,
              card_value, transcript_evidence, suggested_value, severity, status,
              routed_to_user_id, ai_model)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        )
        .run(
          call.tenant_id,
          call.id,
          card.entityType,
          card.entityId,
          d.field_name,
          d.field_label,
          cardValue,
          d.transcript_evidence,
          d.suggested_value,
          d.severity,
          managerUserId,
          aiModel
        );
      savedCount++;
    } else if (settings.recipientMode === "admins") {
      // Вставляем по одной записи на каждого admin user
      const adminIds =
        settings.adminUserIds.length > 0 ? settings.adminUserIds : [null];

      for (const adminId of adminIds) {
        await db
          .prepare(
            `INSERT INTO card_discrepancies
               (tenant_id, call_id, entity_type, entity_id, field_name, field_label,
                card_value, transcript_evidence, suggested_value, severity, status,
                routed_to_user_id, ai_model)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
          )
          .run(
            call.tenant_id,
            call.id,
            card.entityType,
            card.entityId,
            d.field_name,
            d.field_label,
            cardValue,
            d.transcript_evidence,
            d.suggested_value,
            d.severity,
            adminId,
            aiModel
          );
        savedCount++;
      }
    }
  }

  return savedCount;
}

// ──────────────────────────────────────────────────────────────
// 5. Главная функция

/**
 * Запускает AI-проверку карточки CRM для звонка callId.
 * Возвращает количество найденных (и сохранённых) расхождений.
 *
 * Ошибки НЕ пробрасываются наружу — модуль не должен ломать
 * основной пайплайн. Все сбои логируются через console.warn/error.
 */
// ──────────────────────────────────────────────────────────────
// 6. Применение принятого расхождения в Bitrix CRM

/**
 * Применяет принятое расхождение к карточке Bitrix24:
 * обновляет поле field_name значением suggested_value через crm.deal.update / crm.lead.update.
 *
 * Вызывается из resolve-route когда tenant.discrepancy_action_mode = 'auto_approve'.
 * Ошибки пробрасываются — вызывающий код должен их перехватить.
 */
export async function applyDiscrepancyToBitrix(
  discrepancy: import("@/lib/discrepancy-types").CardDiscrepancy
): Promise<void> {
  const tenantId = discrepancy.tenant_id;
  if (tenantId && await isDryRunForTenant(tenantId)) {
    console.info('[discrepancy] DRY_RUN: skip applyDiscrepancyToBitrix for tenant', tenantId);
    return;
  }

  const { entity_type, entity_id, field_name, suggested_value } = discrepancy;

  if (!entity_id || !suggested_value) {
    console.warn(
      `[discrepancy] applyToBitrix: пропускаем #${discrepancy.id} — нет entity_id или suggested_value`
    );
    return;
  }

  // Идемпотентность: проверяем что запись ещё в статусе 'pending'
  // чтобы параллельный ретрай не вызвал двойную запись в Bitrix
  const db = getDbAsync();
  const current = await db
    .prepare("SELECT status FROM card_discrepancies WHERE id = ?")
    .get<{ status: string }>(discrepancy.id);
  if (!current || current.status !== "pending") {
    console.log(
      `[discrepancy] applyToBitrix: #${discrepancy.id} status="${current?.status ?? "not found"}" — пропускаем (уже применено)`
    );
    return;
  }

  const fields = { [field_name]: suggested_value };

  if (entity_type === "deal") {
    await callBitrixApi("crm.deal.update", { id: entity_id, fields });
    console.log(`[discrepancy] deal.update(${entity_id}) ${field_name} = "${suggested_value}"`);
  } else if (entity_type === "lead") {
    await callBitrixApi("crm.lead.update", { id: entity_id, fields });
    console.log(`[discrepancy] lead.update(${entity_id}) ${field_name} = "${suggested_value}"`);
  } else {
    console.warn(
      `[discrepancy] applyToBitrix: entity_type="${entity_type}" не поддерживается — пропускаем #${discrepancy.id}`
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 5. Главная функция

export async function detectDiscrepancies(callId: number): Promise<number> {
  try {
    const db = getDbAsync();

    // 1. Загрузка данных звонка + настроек тенанта
    const loaded = await loadCallData(callId, db);
    if (!loaded) return 0; // выключено или нет данных

    const { call, settings } = loaded;

    // Проверяем что есть транскрипт
    if (!call.transcript || call.transcript.trim().length < 50) {
      console.log(
        `[discrepancy] call #${callId}: транскрипт пустой или слишком короткий — пропускаем`
      );
      return 0;
    }

    // 2. Загрузка карточки Bitrix
    const card = await loadBitrixCard(call, settings);
    if (!card) return 0;

    // Если карточка пустая — нет смысла запускать AI
    if (Object.keys(card.fields).length === 0) {
      console.log(
        `[discrepancy] call #${callId}: карточка Bitrix пустая — пропускаем`
      );
      return 0;
    }

    // 3. AI-детекция
    const { discrepancies, model } = await detectWithAI(call.transcript, card.fields, {
      tenantId: call.tenant_id,
      callId,
    });

    if (discrepancies.length === 0) {
      console.log(`[discrepancy] call #${callId}: AI не нашёл расхождений`);
      return 0;
    }

    // 4. Сохранение и маршрутизация
    const count = await saveAndRoute(discrepancies, model, card, call, settings, db);

    console.log(
      `[discrepancy] call #${callId}: найдено ${discrepancies.length}, сохранено ${count} (порог ${settings.severityMin}+)`
    );
    return count;
  } catch (e) {
    console.error(`[discrepancy] call #${callId} ошибка:`, (e as Error).message);
    return 0;
  }
}
