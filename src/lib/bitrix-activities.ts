/**
 * §3.2-§3.3 + §4.6 MASTER-TZ — забор email и чатов (Open Lines) из Bitrix24.
 *
 * Bitrix хранит ВСЕ касания заказчика как «активности» — звонки, email, чаты,
 * встречи, задачи. Метод `crm.activity.list` возвращает их единым списком,
 * фильтруем по TYPE_ID и PROVIDER_ID.
 *
 * TYPE_ID:
 *   1 — встреча
 *   2 — звонок (уже забираем через voximplant.statistic.get)
 *   3 — задача
 *   4 — email
 *   6 — Open Lines (PROVIDER_ID начинается с 'IMOL_')
 *
 * Здесь тянем 1 (встречи, завершённые), 4 (email) и 6 (Open Lines чаты).
 * Звонки идут отдельным путём (importer.ts).
 */
import { callBitrixApi } from "./bitrix";
import { saveInteraction, type NormalizedInteraction } from "./interaction-source";
import { getDbAsync } from "./db-compat";

interface BitrixActivityRaw {
  ID: string;
  TYPE_ID: string;         // "4" = email, "6" = OL chat
  PROVIDER_ID: string;      // 'CRM_EMAIL', 'IMOL_WHATSAPP', 'IMOL_TELEGRAM', 'IMOL_VK', etc.
  PROVIDER_TYPE_ID: string;
  SUBJECT: string;
  DESCRIPTION: string;
  DESCRIPTION_TYPE: string; // 1=text, 3=BBCode
  DIRECTION: string;        // "1" = incoming, "2" = outgoing
  COMPLETED: string;        // "Y" / "N"
  CREATED: string;
  START_TIME: string;
  RESPONSIBLE_ID: string;   // user id менеджера
  OWNER_TYPE_ID: string;    // 1=Lead, 2=Deal, 3=Contact, 4=Company
  OWNER_ID: string;
  COMMUNICATIONS?: Array<{ TYPE: string; VALUE: string; ENTITY_TYPE_ID: string; ENTITY_ID: string }>;
  BINDINGS?: Array<{ OWNER_TYPE_ID: string; OWNER_ID: string }>;
}

const ENTITY_TYPE_NAME: Record<string, "lead" | "deal" | "contact"> = {
  "1": "lead", "2": "deal", "3": "contact",
};

/** Извлекает телефон из COMMUNICATIONS если есть (для контакта/лида/сделки). */
function extractPhone(raw: BitrixActivityRaw): string | null {
  const phoneEntry = (raw.COMMUNICATIONS ?? []).find((c) => c.TYPE === "PHONE");
  return phoneEntry?.VALUE ?? null;
}

/** Извлекает email из COMMUNICATIONS. */
function extractEmail(raw: BitrixActivityRaw): string | null {
  const emailEntry = (raw.COMMUNICATIONS ?? []).find((c) => c.TYPE === "EMAIL");
  return emailEntry?.VALUE ?? null;
}

/** Чистит HTML/BBCode из тела письма для удобного анализа. */
function cleanBody(raw: string, descriptionType: string): string {
  if (!raw) return "";
  let text = raw;
  // BBCode → plain
  if (descriptionType === "3") {
    text = text
      .replace(/\[\/?(b|i|u|url[^\]]*|color[^\]]*|size[^\]]*|font[^\]]*|center|left|right|justify|s|sub|sup|quote[^\]]*|code|spoiler[^\]]*|list|\*|table|tr|td|img[^\]]*|disk[^\]]*)\]/gi, "")
      .replace(/\[br\]/gi, "\n");
  }
  // HTML → plain (для email где может быть HTML)
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr|td|th|table|ul|ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Сжать множественные переносы
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/** Маппит сырую activity в нормализованную interaction. */
function normalizeActivity(raw: BitrixActivityRaw, tenantId: number): NormalizedInteraction | null {
  const typeId = raw.TYPE_ID;
  const providerId = raw.PROVIDER_ID || "";

  // Определяем тип взаимодействия и канал
  let interactionType: NormalizedInteraction["type"];
  let channel: NormalizedInteraction["channel"];

  if (typeId === "1") {
    // Встреча (CRM-активность «Встреча»). Анализируем ТОЛЬКО завершённые —
    // у запланированных (COMPLETED=N) ещё нет итога, анализировать рано.
    // Текст для анализа = тема (SUBJECT) + описание/итог (DESCRIPTION),
    // который менеджер заполняет руками после встречи.
    if (raw.COMPLETED !== "Y") return null;
    interactionType = "meeting";
    channel = "other";
  } else if (typeId === "4" || providerId === "CRM_EMAIL") {
    interactionType = "email";
    channel = "email_imap";
  } else if (providerId.startsWith("IMOL_")) {
    // ВАЖНО: только PROVIDER_ID 'IMOL_*' = реальные заказчикские чаты в Open Lines.
    // TYPE_ID=6 включает также CRM_TODO/CRM_TASKS_TASK (внутренние задачи менеджеров),
    // их игнорируем — это не коммуникации с заказчиками.
    interactionType = "chat";
    if (providerId.includes("WHATSAPP")) channel = "whatsapp";
    else if (providerId.includes("TELEGRAM")) channel = "telegram";
    else channel = "openlines";
  } else {
    return null;
  }

  const direction = raw.DIRECTION === "1" ? "in" : raw.DIRECTION === "2" ? "out" : null;
  const subject = raw.SUBJECT?.trim() || "";
  const body = cleanBody(raw.DESCRIPTION ?? "", raw.DESCRIPTION_TYPE);

  // Текст для анализа: тема + тело (для email тема информативна, для чата её обычно нет)
  const contentText = subject && body
    ? `Тема: ${subject}\n\n${body}`
    : body || subject;

  if (!contentText) return null; // пусто — не пишем

  // Привязка к Bitrix-сущностям
  const ownerTypeName = ENTITY_TYPE_NAME[raw.OWNER_TYPE_ID];
  const bindings = raw.BINDINGS ?? [];

  let dealId: string | null = null;
  let leadId: string | null = null;
  let contactId: string | null = null;
  // Из BINDINGS (там могут быть несколько)
  for (const b of bindings) {
    if (b.OWNER_TYPE_ID === "1" && !leadId)    leadId = b.OWNER_ID;
    if (b.OWNER_TYPE_ID === "2" && !dealId)    dealId = b.OWNER_ID;
    if (b.OWNER_TYPE_ID === "3" && !contactId) contactId = b.OWNER_ID;
  }
  // Fallback из OWNER_TYPE_ID/OWNER_ID
  if (ownerTypeName === "lead" && !leadId) leadId = raw.OWNER_ID;
  if (ownerTypeName === "deal" && !dealId) dealId = raw.OWNER_ID;
  if (ownerTypeName === "contact" && !contactId) contactId = raw.OWNER_ID;

  return {
    externalId: raw.ID,
    tenantId,
    type: interactionType,
    channel,
    direction,
    managerId: raw.RESPONSIBLE_ID || null,
    managerName: null,    // подтянется через managers cache
    clientPhone: extractPhone(raw),
    clientName: extractEmail(raw),  // для email канала клиент = email
    bitrixDealId: dealId,
    bitrixLeadId: leadId,
    bitrixContactId: contactId,
    bitrixActivityId: raw.ID,
    startedAt: raw.START_TIME || raw.CREATED || new Date().toISOString().replace("T", " ").slice(0, 19),
    durationSec: 0,
    contentText,
    recordingUrl: null,
    initialStatus: "pending",
  };
}

export interface FetchOptions {
  tenantId: number;
  /** ISO timestamp — последний known activity. Если null/undefined — fetch без фильтра (вся история). */
  since?: string | null;
  /** Макс activities за один прогон (default 200) */
  limit?: number;
}

export interface FetchResult {
  totalFetched: number;
  inserted: number;
  skipped: number;
  errors: number;
}

/**
 * Тянет встречи, email и Open Lines чаты из Bitrix24.
 * Идемпотентно — повторный запуск не создаст дублей.
 *
 * Фильтры:
 *  - TYPE_ID IN (1, 4, 6) — встречи (только завершённые), email и Open Lines
 *  - COMPLETED = Y или N — для email/чатов оба; для встреч только Y
 *  - CREATED >= since — если передан
 *
 * Лимит на прогон — пагинация через start. Если activities в Bitrix больше limit —
 * берём первые limit; в следующий вызов с since=last_created подтянутся следующие.
 */
export async function fetchEmailAndChats(opts: FetchOptions): Promise<FetchResult> {
  const result: FetchResult = { totalFetched: 0, inserted: 0, skipped: 0, errors: 0 };
  const limit = opts.limit ?? 200;
  let start = 0;
  let processed = 0;

  // Три отдельных запроса:
  //  TYPE_ID=1 — встречи (берём только COMPLETED=Y — завершённые, с итогом)
  //  TYPE_ID=4 — email
  //  TYPE_ID=6 — всё прочее, фильтруем на нашей стороне (только PROVIDER_ID IMOL_*)
  for (const typeId of ["1", "4", "6"]) {
    while (processed < limit) {
      const filter: Record<string, unknown> = { TYPE_ID: typeId };
      if (opts.since) filter[">=CREATED"] = opts.since;
      // Встречи — только завершённые (запланированные без итога анализировать рано).
      // Дублируем серверным фильтром, чтобы не тянуть лишнее (в normalizeActivity тоже есть guard).
      if (typeId === "1") filter.COMPLETED = "Y";
      // Для TYPE_ID=6 ограничиваем PROVIDER_ID — иначе тянем кучу CRM_TODO/CRM_TASKS_TASK
      // (внутренние задачи менеджеров). Bitrix принимает % wildcard через специальный синтаксис.
      if (typeId === "6") {
        // Bitrix не умеет LIKE по PROVIDER_ID в filter — придётся отфильтровать в normalizeActivity
        // (что уже сделано: PROVIDER_ID.startsWith('IMOL_'))
      }

      const page = await callBitrixApi<BitrixActivityRaw[]>("crm.activity.list", {
        filter,
        order: { CREATED: "DESC" },
        select: [
          "ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID",
          "SUBJECT", "DESCRIPTION", "DESCRIPTION_TYPE",
          "DIRECTION", "COMPLETED", "CREATED", "START_TIME",
          "RESPONSIBLE_ID", "OWNER_TYPE_ID", "OWNER_ID",
          "COMMUNICATIONS", "BINDINGS",
        ],
        start,
      });

      if (!page || page.length === 0) break;

      for (const raw of page) {
        result.totalFetched += 1;
        processed += 1;
        try {
          const normalized = normalizeActivity(raw, opts.tenantId);
          if (!normalized) { result.skipped += 1; continue; }
          const callId = await saveInteraction(normalized);
          if (callId) result.inserted += 1;
          else result.skipped += 1;
        } catch (e) {
          console.warn(`[bitrix-activities] normalize/save failed for activity ${raw.ID}:`, (e as Error).message);
          result.errors += 1;
        }
        if (processed >= limit) break;
      }

      if (page.length < 50) break;  // Bitrix отдаёт по 50 за страницу
      start += page.length;
    }
    processed = 0;  // сброс лимита между типами
  }

  // Сохраняем last_fetched_at чтобы следующий прогон делал инкрементальный fetch
  await getDbAsync()
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run("bitrix_activities_last_fetched", new Date().toISOString());

  return result;
}

/** Когда последний раз тянули активности. Для инкрементального fetch. */
export async function getLastFetchedAt(): Promise<string | null> {
  const row = await getDbAsync()
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get<{ value: string }>("bitrix_activities_last_fetched");
  return row?.value ?? null;
}
