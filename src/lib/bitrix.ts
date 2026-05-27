/**
 * Тонкий клиент к Bitrix24 через классический входящий вебхук.
 * Док: https://dev.1c-bitrix.ru/rest_help/
 *
 * BITRIX_WEBHOOK_URL должен оканчиваться на "/", напр.:
 *   https://yourportal.bitrix24.ru/rest/1/abc123def/
 */
import fs from "fs";
import path from "path";

function baseUrl(): string {
  const url = process.env.BITRIX_WEBHOOK_URL?.trim();
  if (!url) throw new Error("BITRIX_WEBHOOK_URL не задан");
  return url.endsWith("/") ? url : url + "/";
}

export class BitrixError extends Error {
  constructor(message: string, public method: string, public payload?: unknown) {
    super(message);
  }
}

async function call<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = baseUrl() + method + ".json";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { result?: T; error?: string; error_description?: string };
  if (!res.ok || data.error) {
    throw new BitrixError(
      `${method}: ${data.error || res.statusText} — ${data.error_description ?? ""}`,
      method,
      data
    );
  }
  return data.result as T;
}

// ──────────────────────────────────────────────────────────────
// Voximplant / телефония

export interface VoxStatistic {
  ID: string;
  CALL_TYPE: string;         // "1" входящий, "2" исходящий
  CALL_DURATION: string;
  CALL_START_DATE: string;
  CALL_RECORD_URL?: string;
  CALL_WEBDAV_URL?: string;
  PHONE_NUMBER?: string;
  PORTAL_USER_ID?: string;   // менеджер
  CRM_ENTITY_TYPE?: string;  // LEAD/DEAL/CONTACT/COMPANY
  CRM_ENTITY_ID?: string;
  CRM_ACTIVITY_ID?: string;
}

export async function voxGetStatistic(callId: string): Promise<VoxStatistic | null> {
  const result = await call<VoxStatistic[]>("voximplant.statistic.get", {
    FILTER: { CALL_ID: callId },
  });
  return result?.[0] ?? null;
}

// ──────────────────────────────────────────────────────────────
// CRM Activity — для классической схемы с произвольной телефонией.
// Когда внешняя АТС закрывает звонок через telephony.externalcall.finish,
// он также может оказаться в crm.activity с типом PROVIDER_TYPE_ID = 'CALL'.

export interface CrmActivity {
  ID: string;
  TYPE_ID: string;
  PROVIDER_TYPE_ID: string;
  SUBJECT?: string;
  DESCRIPTION?: string;
  RESPONSIBLE_ID?: string;
  OWNER_TYPE_ID?: string;   // 1=Lead, 2=Deal, 3=Contact, 4=Company
  OWNER_ID?: string;
  FILES?: Array<{ urlMachine?: string; url?: string; name?: string }>;
  START_TIME?: string;
}

export async function crmActivityGet(id: string): Promise<CrmActivity | null> {
  try {
    return await call<CrmActivity>("crm.activity.get", { id });
  } catch {
    return null;
  }
}

export async function crmTimelineCommentAdd(args: {
  entityTypeId: number;   // 1=Lead, 2=Deal, 3=Contact, 4=Company
  entityId: number | string;
  comment: string;
}): Promise<number> {
  const result = await call<number>("crm.timeline.comment.add", {
    fields: {
      ENTITY_ID: args.entityId,
      ENTITY_TYPE: typeMap[args.entityTypeId] ?? "deal",
      COMMENT: args.comment,
    },
  });
  return result;
}

const typeMap: Record<number, string> = {
  1: "lead",
  2: "deal",
  3: "contact",
  4: "company",
};

export async function crmActivityUpdate(id: string, fields: Record<string, unknown>): Promise<boolean> {
  return await call<boolean>("crm.activity.update", { id, fields });
}

// ──────────────────────────────────────────────────────────────
// Скачивание записи в локальный файл

export async function downloadRecording(url: string, outDir: string, callId: string): Promise<string> {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать запись ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = inferExt(url, res.headers.get("content-type"));
  const filePath = path.join(outDir, `${callId}${ext}`);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

function inferExt(url: string, contentType: string | null): string {
  const u = url.toLowerCase();
  if (u.endsWith(".mp3")) return ".mp3";
  if (u.endsWith(".wav")) return ".wav";
  if (u.endsWith(".ogg") || u.endsWith(".oga")) return ".ogg";
  if (u.endsWith(".m4a")) return ".m4a";
  if (contentType?.includes("mpeg")) return ".mp3";
  if (contentType?.includes("wav")) return ".wav";
  if (contentType?.includes("ogg")) return ".ogg";
  return ".mp3";
}

// ──────────────────────────────────────────────────────────────
// Утилиты

/** Из CRM_ENTITY_TYPE/OWNER_TYPE_ID в число */
export function entityTypeStringToId(t?: string | null): number | null {
  if (!t) return null;
  const x = t.toUpperCase();
  if (x === "LEAD" || x === "1") return 1;
  if (x === "DEAL" || x === "2") return 2;
  if (x === "CONTACT" || x === "3") return 3;
  if (x === "COMPANY" || x === "4") return 4;
  return null;
}

// ──────────────────────────────────────────────────────────────
// Контекст сделки/лида — нужен Claude как фон для оценки звонка

export interface Deal {
  ID: string;
  TITLE?: string;
  STAGE_ID?: string;
  OPPORTUNITY?: string;     // сумма
  CURRENCY_ID?: string;
  TYPE_ID?: string;
  ASSIGNED_BY_ID?: string;
  COMMENTS?: string;
  DATE_CREATE?: string;
  CONTACT_ID?: string;
  COMPANY_ID?: string;
  CATEGORY_ID?: string;
}

export interface Lead {
  ID: string;
  TITLE?: string;
  NAME?: string;
  LAST_NAME?: string;
  STATUS_ID?: string;
  OPPORTUNITY?: string;
  ASSIGNED_BY_ID?: string;
  COMMENTS?: string;
  DATE_CREATE?: string;
}

export async function crmDealGet(id: string | number): Promise<Deal | null> {
  try {
    return await call<Deal>("crm.deal.get", { id });
  } catch {
    return null;
  }
}

export async function crmLeadGet(id: string | number): Promise<Lead | null> {
  try {
    return await call<Lead>("crm.lead.get", { id });
  } catch {
    return null;
  }
}

/** Последние N комментариев таймлайна сущности — выжимка истории сделки */
export async function crmTimelineComments(
  entityType: "deal" | "lead" | "contact" | "company",
  entityId: string | number,
  limit = 5
): Promise<Array<{ ID: string; COMMENT: string; CREATED: string; AUTHOR_ID: string }>> {
  try {
    const result = await call<Array<{ ID: string; COMMENT: string; CREATED: string; AUTHOR_ID: string }>>(
      "crm.timeline.comment.list",
      {
        filter: { ENTITY_ID: entityId, ENTITY_TYPE: entityType },
        order: { ID: "DESC" },
        select: ["ID", "COMMENT", "CREATED", "AUTHOR_ID"],
      }
    );
    return (result ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

/** Прошлые звонки по этой же сущности (по нашей БД? нет — по Битриксу) */
export async function crmPriorActivities(
  ownerType: "deal" | "lead",
  ownerId: string | number,
  limit = 10
): Promise<Array<{ ID: string; SUBJECT: string; START_TIME: string; PROVIDER_TYPE_ID: string }>> {
  const ownerTypeId = ownerType === "deal" ? 2 : 1;
  try {
    const result = await call<any[]>("crm.activity.list", {
      filter: { OWNER_TYPE_ID: ownerTypeId, OWNER_ID: ownerId },
      order: { ID: "DESC" },
      select: ["ID", "SUBJECT", "START_TIME", "PROVIDER_TYPE_ID"],
    });
    return (result ?? []).slice(0, limit);
  } catch {
    return [];
  }
}

export interface DealContext {
  kind: "deal" | "lead" | null;
  entityId: string | null;
  title: string | null;
  stage: string | null;
  opportunity: string | null;
  createdAt: string | null;
  recentComments: Array<{ author: string; text: string; createdAt: string }>;
  priorActivities: Array<{ subject: string; type: string; startAt: string }>;
}

/** Собирает фон по звонку: если связан со сделкой/лидом — возвращает свёртку */
export async function buildCallContext(args: {
  bitrixDealId: string | null;
  bitrixLeadId: string | null;
}): Promise<DealContext | null> {
  const { bitrixDealId, bitrixLeadId } = args;
  if (!bitrixDealId && !bitrixLeadId) return null;

  if (bitrixDealId) {
    const deal = await crmDealGet(bitrixDealId);
    if (!deal) return null;
    const [comments, acts] = await Promise.all([
      crmTimelineComments("deal", bitrixDealId, 5),
      crmPriorActivities("deal", bitrixDealId, 10),
    ]);
    return {
      kind: "deal",
      entityId: bitrixDealId,
      title: deal.TITLE ?? null,
      stage: deal.STAGE_ID ?? null,
      opportunity: deal.OPPORTUNITY
        ? `${deal.OPPORTUNITY}${deal.CURRENCY_ID ? " " + deal.CURRENCY_ID : ""}`
        : null,
      createdAt: deal.DATE_CREATE ?? null,
      recentComments: comments.map((c) => ({
        author: c.AUTHOR_ID,
        text: stripBitrixHtml(c.COMMENT),
        createdAt: c.CREATED,
      })),
      priorActivities: acts.map((a) => ({
        subject: a.SUBJECT,
        type: a.PROVIDER_TYPE_ID,
        startAt: a.START_TIME,
      })),
    };
  }

  // lead
  const lead = await crmLeadGet(bitrixLeadId!);
  if (!lead) return null;
  const [comments, acts] = await Promise.all([
    crmTimelineComments("lead", bitrixLeadId!, 5),
    crmPriorActivities("lead", bitrixLeadId!, 10),
  ]);
  return {
    kind: "lead",
    entityId: bitrixLeadId,
    title:
      lead.TITLE ||
      [lead.NAME, lead.LAST_NAME].filter(Boolean).join(" ") ||
      null,
    stage: lead.STATUS_ID ?? null,
    opportunity: lead.OPPORTUNITY ?? null,
    createdAt: lead.DATE_CREATE ?? null,
    recentComments: comments.map((c) => ({
      author: c.AUTHOR_ID,
      text: stripBitrixHtml(c.COMMENT),
      createdAt: c.CREATED,
    })),
    priorActivities: acts.map((a) => ({
      subject: a.SUBJECT,
      type: a.PROVIDER_TYPE_ID,
      startAt: a.START_TIME,
    })),
  };
}

function stripBitrixHtml(s: string): string {
  return s
    .replace(/\[\/?B\]/gi, "")
    .replace(/\[\/?I\]/gi, "")
    .replace(/\[\/?U\]/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export { call as bitrixCall };
