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

/**
 * Из URL вида `https://portal.bitrix24.ru/rest/<userId>/<token>/`
 * достаём <token> — он нужен для подстановки в `auth=` параметр
 * прямых ссылок на скачивание файлов из Битрикс-диска.
 */
function extractWebhookToken(): string | null {
  const url = process.env.BITRIX_WEBHOOK_URL?.trim();
  if (!url) return null;
  // /rest/123/abcDEF1234.../ — нам нужен сегмент после userId
  const m = url.match(/\/rest\/\d+\/([^/]+)\/?/);
  return m?.[1] ?? null;
}

/**
 * Битрикс часто возвращает ссылки на скачивание с пустым параметром
 * `auth=` — нужно подставить токен из webhook URL, иначе будет 401.
 * Также корректно обрабатывает URL без параметра auth вообще.
 */
export function appendAuthToFileUrl(url: string): string {
  const token = extractWebhookToken();
  if (!token) return url;
  // Если уже есть auth=<что-то>, перезаписываем; иначе добавляем
  if (/[?&]auth=/.test(url)) {
    return url.replace(/(\?|&)auth=[^&]*/, `$1auth=${token}`);
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}auth=${token}`;
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

/**
 * Постраничный листинг истории звонков из Voximplant.
 * Возвращает страницу записей + следующий offset для пагинации.
 * Bitrix отдаёт максимум 50 записей за один запрос.
 *
 * Чтобы вытащить всё за период — итерируем пока `next` не вернёт null.
 */
export async function voxListStatistics(opts: {
  fromDate?: string;             // YYYY-MM-DD
  toDate?: string;               // YYYY-MM-DD
  managerIds?: string[];         // PORTAL_USER_ID (только эти менеджеры)
  hasRecordOnly?: boolean;       // фильтровать только звонки с записью
  start?: number;                // offset для пагинации
}): Promise<{ items: VoxStatistic[]; next: number | null; total: number }> {
  const filter: Record<string, unknown> = {};
  if (opts.fromDate) filter[">=CALL_START_DATE"] = opts.fromDate;
  if (opts.toDate) filter["<=CALL_START_DATE"] = opts.toDate + " 23:59:59";
  if (opts.managerIds && opts.managerIds.length > 0) filter["PORTAL_USER_ID"] = opts.managerIds;
  if (opts.hasRecordOnly) filter[">CALL_DURATION"] = "0";

  // Bitrix REST: пагинация через top-level `start`, не в FILTER
  const params: Record<string, unknown> = {
    FILTER: filter,
    SORT: "CALL_START_DATE",
    ORDER: "DESC",
  };
  if (opts.start) params.start = opts.start;

  const url = baseUrl() + "voximplant.statistic.get.json";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as {
    result?: VoxStatistic[];
    total?: number;
    next?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || data.error) {
    throw new BitrixError(
      `voximplant.statistic.get: ${data.error || res.statusText} — ${data.error_description ?? ""}`,
      "voximplant.statistic.get",
      data
    );
  }
  return {
    items: data.result ?? [],
    next: typeof data.next === "number" ? data.next : null,
    total: data.total ?? data.result?.length ?? 0,
  };
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
  } catch (e) {
    console.warn(`[bitrix] crm.activity.get(${id}) failed:`, (e as Error).message);
    return null;
  }
}

/**
 * Получить активность через `crm.activity.list` — этот метод (в отличие от .get)
 * стабильно возвращает поле FILES со ссылкой на запись для внешних АТС.
 */
export async function crmActivityListById(id: string): Promise<CrmActivity | null> {
  try {
    const list = await call<CrmActivity[]>("crm.activity.list", {
      filter: { ID: id },
      select: ["*", "FILES"],
    });
    return list?.[0] ?? null;
  } catch (e) {
    console.warn(`[bitrix] crm.activity.list(ID=${id}) failed:`, (e as Error).message);
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
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Не удалось скачать запись ${url}: ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  // Защита: если Битрикс вернул HTML вместо аудио — это auth ошибка
  // (URL вида /bitrix/tools/crm_show_file.php требует session-auth, не webhook)
  if (ct.includes("text/html")) {
    const preview = (await res.text()).slice(0, 200);
    throw new Error(`Битрикс вернул HTML вместо аудио (нужен disk.file.get DOWNLOAD_URL): ${preview}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = inferExt(url, ct);
  const filePath = path.join(outDir, `${callId}${ext}`);
  fs.writeFileSync(filePath, buf);
  return filePath;
}

/**
 * Получить машинную DOWNLOAD_URL по ID файла из b_file (Bitrix Disk).
 * Эта ссылка содержит собственный одноразовый токен и работает напрямую
 * через fetch — auth подставлять не нужно.
 */
export async function diskFileGetDownloadUrl(fileId: string | number): Promise<string | null> {
  try {
    const file = await call<{
      ID: string;
      NAME?: string;
      DOWNLOAD_URL?: string;
    }>("disk.file.get", { id: fileId });
    return file?.DOWNLOAD_URL ?? null;
  } catch (e) {
    console.warn(`[bitrix] disk.file.get(${fileId}) failed:`, (e as Error).message);
    return null;
  }
}

/**
 * Резолв ссылки на запись по CRM_ACTIVITY_ID — для внешних телефоний
 * (Телфин, Mango, UIS и т.п.) где voximplant.statistic.get отдаёт
 * CALL_RECORD_URL=null, а файл лежит в crm.activity.FILES.
 *
 * Алгоритм:
 *  1. crm.activity.list(filter=ID) → берём FILES[0].id (это b_file.ID)
 *  2. disk.file.get(id) → берём DOWNLOAD_URL (машинная ссылка с токеном)
 *
 * Использует list а не .get, потому что .get НЕ возвращает FILES
 * в текущих версиях Битрикса.
 */
export async function resolveRecordingFromActivity(activityId: string): Promise<string | null> {
  const a = await crmActivityListById(activityId);
  if (!a) {
    console.warn(`[bitrix] resolveRecording: activity ${activityId} не найдена`);
    return null;
  }
  const file = a.FILES?.[0];
  if (!file) {
    console.warn(`[bitrix] resolveRecording: activity ${activityId} без FILES (запись отсутствует)`);
    return null;
  }

  // Если в FILES уже есть готовая машинная ссылка — используем её
  if (file.urlMachine) return file.urlMachine;

  // Иначе резолвим через disk.file.get
  const fileId = (file as { id?: number | string }).id;
  if (!fileId) {
    console.warn(`[bitrix] resolveRecording: activity ${activityId} FILES[0] без id`);
    return null;
  }
  const dl = await diskFileGetDownloadUrl(fileId);
  if (!dl) {
    console.warn(`[bitrix] resolveRecording: disk.file.get(${fileId}) вернул null`);
  }
  return dl;
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

/**
 * Получить пачку RESPONSIBLE_ID для активностей CALL за период.
 * Используется чтобы атрибутировать звонки на правильного менеджера
 * (того кто фактически работает с CRM-карточкой, а не того кто
 * первым взял трубку — это бывает диспетчер).
 *
 * Битрикс ограничивает 50 на страницу — пагинируем.
 */
export async function crmCallActivitiesByPeriod(opts: {
  fromDate: string;
  toDate?: string;
}): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let start = 0;
  for (let page = 0; page < 50; page++) {
    try {
      const params: Record<string, unknown> = {
        filter: {
          PROVIDER_TYPE_ID: "CALL",
          ">=CREATED": opts.fromDate,
          "<=CREATED": (opts.toDate || opts.fromDate) + " 23:59:59",
        },
        select: ["ID", "RESPONSIBLE_ID"],
        order: { ID: "ASC" },
      };
      if (start) params.start = start;
      const url = baseUrl() + "crm.activity.list.json";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = (await res.json()) as {
        result?: Array<{ ID: string; RESPONSIBLE_ID: string }>;
        next?: number;
      };
      for (const a of data.result || []) {
        if (a.ID && a.RESPONSIBLE_ID) map.set(String(a.ID), String(a.RESPONSIBLE_ID));
      }
      if (data.next == null) break;
      start = data.next;
    } catch (e) {
      console.warn("[bitrix] crmCallActivitiesByPeriod page error:", (e as Error).message);
      break;
    }
  }
  return map;
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

// ──────────────────────────────────────────────────────────────
// Пользователи (менеджеры)

export interface BitrixUser {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  SECOND_NAME?: string;
  EMAIL?: string;
  ACTIVE?: boolean;
}

/** Получить одного пользователя по ID */
export async function userGet(id: string | number): Promise<BitrixUser | null> {
  try {
    const r = await call<BitrixUser[]>("user.get", { ID: id });
    return r?.[0] ?? null;
  } catch (e) {
    console.warn(`[bitrix] user.get(${id}) failed:`, (e as Error).message);
    return null;
  }
}

/** Получить пачку пользователей по списку ID (Bitrix лимит 50 за раз) */
export async function usersGetBatch(ids: Array<string | number>): Promise<Map<string, BitrixUser>> {
  const out = new Map<string, BitrixUser>();
  const unique = [...new Set(ids.map(String))].filter(Boolean);

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    try {
      const r = await call<BitrixUser[]>("user.get", { FILTER: { ID: chunk } });
      for (const u of r ?? []) out.set(u.ID, u);
    } catch (e) {
      console.warn(`[bitrix] usersGetBatch chunk failed:`, (e as Error).message);
    }
  }
  return out;
}

/** Сложить ФИО в формат "Фамилия Имя" (или Имя если фамилии нет) */
export function formatUserName(u: BitrixUser): string {
  const last = u.LAST_NAME?.trim();
  const name = u.NAME?.trim();
  return [last, name].filter(Boolean).join(" ") || u.EMAIL || `ID ${u.ID}`;
}

export { call as bitrixCall };
