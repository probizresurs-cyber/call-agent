/**
 * §5.5 + §7 MASTER-TZ — запись в Bitrix24 CRM из анализа звонка.
 *
 * **Безопасность по умолчанию:** все функции проверяют per-tenant DRY_RUN
 * (lib/flags.ts isDryRunForTenant). При DRY_RUN=true только формируется
 * payload и пишется в crm_write_log с mode='dry' — наружу ничего не уходит.
 *
 * Включение реальной отправки = переключить DRY_RUN в /settings → Системные флаги.
 *
 * Три типа записи (§5.5):
 *   1. Комментарий в Timeline сущности (deal/lead/contact) — самый безопасный
 *   2. Задача с next_action — для follow-up
 *   3. Заполнение поля DESCRIPTION в карточке Activity (звонок) — резюме рядом со звонком
 *
 * Контракт: каждая функция возвращает { mode, status, entityType, entityId, payload, result? }.
 * UI показывает это пользователю — что бы / что было отправлено.
 */
import { getDbAsync } from "./db-compat";
import { isDryRunForTenant } from "./flags";
import { crmTimelineCommentAdd, crmActivityUpdate } from "./bitrix";
import { logCrmWrite, alreadySentLive, type CrmAction, type CrmMode } from "./crm-log";

export interface WriteResult {
  action: CrmAction;
  mode: CrmMode;
  status: "sent" | "skipped_dry" | "skipped_duplicate" | "failed" | "no_target";
  entityType: string | null;     // deal/lead/contact/activity
  entityId: string | null;
  payload: unknown;               // что было сформировано (для DRY превью)
  result?: unknown;               // ответ Bitrix (live) или ошибка
  error?: string;
}

interface CallForCrm {
  id: number;
  tenant_id: number | null;
  bitrix_deal_id: string | null;
  bitrix_lead_id: string | null;
  bitrix_contact_id: string | null;
  bitrix_activity_id: string | null;
  client_phone: string | null;
  started_at: string | null;
  duration_sec: number;
  direction: "in" | "out" | null;
}

interface AnalysisForCrm {
  summary: string | null;
  sentiment: string | null;
  manager_score: number | null;
  script_compliance: number | null;
  next_action: string | null;
  client_name: string | null;
  detected_product: string | null;
  objections_json: string | null;
  topics_json: string | null;
}

async function loadCallAndAnalysis(callId: number): Promise<{ call: CallForCrm; analysis: AnalysisForCrm | null } | null> {
  const db = getDbAsync();
  const call = await db
    .prepare(
      `SELECT id, tenant_id, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id,
              bitrix_activity_id, client_phone, started_at, duration_sec, direction
       FROM calls WHERE id = ?`
    )
    .get<CallForCrm>(callId);
  if (!call) return null;

  const analysis = await db
    .prepare(
      `SELECT summary, sentiment, manager_score, script_compliance, next_action,
              client_name, detected_product, objections_json, topics_json
       FROM analyses WHERE call_id = ?`
    )
    .get<AnalysisForCrm>(callId);

  return { call, analysis: analysis ?? null };
}

/**
 * Формирование текста комментария — единое место для всех CRM-целей.
 * Намеренно лаконично: только краткое содержание + следующий шаг.
 * Метрики, чек-лист, возражения, темы — НЕ выводим (по запросу заказчика
 * комментарий должен быть максимально коротким). Полный разбор — по ссылке.
 */
function buildSummaryMarkdown(call: CallForCrm, a: AnalysisForCrm): string {
  const dashboardUrl = `https://marketradar24.ru/call-agent/calls/${call.id}`;

  const lines: string[] = [];
  lines.push("[B]🤖 Анализ звонка (Call-Agent)[/B]");
  lines.push("");

  if (a.summary) {
    lines.push("[B]Краткое содержание:[/B]");
    lines.push(a.summary);
    lines.push("");
  }

  if (a.next_action) {
    lines.push("[B]Следующий шаг:[/B] " + a.next_action);
    lines.push("");
  }

  lines.push("[URL=" + dashboardUrl + "]Полный разбор в Call-Agent →[/URL]");

  return lines.join("\n");
}

function safeJsonArray(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

/**
 * Главная точка: отправить (или симулировать) всё что можем по звонку.
 * Создаёт один комментарий на КАЖДУЮ связанную сущность (deal, lead, contact).
 * Возвращает массив результатов — UI рендерит их.
 */
export async function sendCallToBitrix(callId: number): Promise<WriteResult[]> {
  const data = await loadCallAndAnalysis(callId);
  if (!data) return [];
  const { call, analysis } = data;
  if (!analysis) {
    return [{
      action: "comment", mode: "dry", status: "no_target",
      entityType: null, entityId: null, payload: null,
      error: "Звонок не имеет анализа — отправлять нечего"
    }];
  }

  const tenantId = call.tenant_id ?? 1;
  const dryRun = await isDryRunForTenant(tenantId);
  const text = buildSummaryMarkdown(call, analysis);

  // Список целей: Deal > Lead (если оба null — Contact один). Если ВСЕ null — Activity без targets.
  // По умолчанию пишем В ВСЕ связанные. Клиент в ответах может уточнить «только в сделку» —
  // тогда логика поменяется через настройку tenant.settings.crm_write_targets.
  const targets: Array<{ entityType: string; entityTypeId: number; entityId: string }> = [];
  if (call.bitrix_deal_id)    targets.push({ entityType: "deal",    entityTypeId: 2, entityId: call.bitrix_deal_id });
  if (call.bitrix_lead_id)    targets.push({ entityType: "lead",    entityTypeId: 1, entityId: call.bitrix_lead_id });
  if (call.bitrix_contact_id) targets.push({ entityType: "contact", entityTypeId: 3, entityId: call.bitrix_contact_id });

  if (targets.length === 0 && !call.bitrix_activity_id) {
    return [{
      action: "comment", mode: dryRun ? "dry" : "live", status: "no_target",
      entityType: null, entityId: null, payload: { text },
      error: "Звонок не связан с CRM-сущностями (Deal/Lead/Contact/Activity)"
    }];
  }

  const results: WriteResult[] = [];
  for (const t of targets) {
    results.push(await postCommentTo(tenantId, callId, t, text, dryRun));
  }

  // Также можно обновить DESCRIPTION в Activity (если есть activity_id) —
  // это пишет резюме прямо в карточку звонка, видно при просмотре истории Bitrix.
  if (call.bitrix_activity_id && call.bitrix_activity_id !== "0") {
    results.push(await updateActivity(tenantId, callId, call.bitrix_activity_id, text, dryRun));
  }

  return results;
}

async function postCommentTo(
  tenantId: number,
  callId: number,
  target: { entityType: string; entityTypeId: number; entityId: string },
  text: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const payload = {
    entityType: target.entityType,
    entityId: target.entityId,
    comment: text,
  };

  // Дедуп live-вызовов
  if (!dryRun) {
    const dup = await alreadySentLive(`${callId}:comment:${target.entityType}:${target.entityId}`);
    if (dup) {
      const r: WriteResult = {
        action: "comment", mode: "live", status: "skipped_duplicate",
        entityType: target.entityType, entityId: target.entityId, payload,
      };
      await logCrmWrite({ tenantId, callId, action: "comment", entityType: target.entityType, entityId: target.entityId, mode: "live", status: "skipped_dry", payload });
      return r;
    }
  }

  if (dryRun) {
    await logCrmWrite({
      tenantId, callId, action: "comment",
      entityType: target.entityType, entityId: target.entityId,
      mode: "dry", status: "skipped_dry", payload,
    });
    return {
      action: "comment", mode: "dry", status: "skipped_dry",
      entityType: target.entityType, entityId: target.entityId, payload,
    };
  }

  // LIVE отправка
  try {
    const commentId = await crmTimelineCommentAdd({
      entityTypeId: target.entityTypeId,
      entityId: target.entityId,
      comment: text,
    });
    await logCrmWrite({
      tenantId, callId, action: "comment",
      entityType: target.entityType, entityId: target.entityId,
      mode: "live", status: "sent", payload, result: { comment_id: commentId },
    });
    return {
      action: "comment", mode: "live", status: "sent",
      entityType: target.entityType, entityId: target.entityId, payload, result: { comment_id: commentId },
    };
  } catch (e) {
    const err = (e as Error).message;
    await logCrmWrite({
      tenantId, callId, action: "comment",
      entityType: target.entityType, entityId: target.entityId,
      mode: "live", status: "failed", payload, result: { error: err },
    });
    return {
      action: "comment", mode: "live", status: "failed",
      entityType: target.entityType, entityId: target.entityId, payload, error: err,
    };
  }
}

async function updateActivity(
  tenantId: number,
  callId: number,
  activityId: string,
  text: string,
  dryRun: boolean,
): Promise<WriteResult> {
  const payload = { activityId, fields: { DESCRIPTION: text, DESCRIPTION_TYPE: 3 } }; // 3 = BBCode

  if (dryRun) {
    await logCrmWrite({
      tenantId, callId, action: "activity_update",
      entityType: "activity", entityId: activityId,
      mode: "dry", status: "skipped_dry", payload,
    });
    return {
      action: "activity_update", mode: "dry", status: "skipped_dry",
      entityType: "activity", entityId: activityId, payload,
    };
  }

  try {
    const ok = await crmActivityUpdate(activityId, payload.fields);
    await logCrmWrite({
      tenantId, callId, action: "activity_update",
      entityType: "activity", entityId: activityId,
      mode: "live", status: "sent", payload, result: { ok },
    });
    return {
      action: "activity_update", mode: "live", status: "sent",
      entityType: "activity", entityId: activityId, payload, result: { ok },
    };
  } catch (e) {
    const err = (e as Error).message;
    await logCrmWrite({
      tenantId, callId, action: "activity_update",
      entityType: "activity", entityId: activityId,
      mode: "live", status: "failed", payload, result: { error: err },
    });
    return {
      action: "activity_update", mode: "live", status: "failed",
      entityType: "activity", entityId: activityId, payload, error: err,
    };
  }
}
