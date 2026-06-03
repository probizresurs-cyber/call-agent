import path from "path";
import { setCallStatus, NoRecordingError, type CallRow, type ChecklistItem } from "./db";
import { getDbAsync } from "@/lib/db-compat";
import {
  downloadRecording,
  crmTimelineCommentAdd,
  entityTypeStringToId,
  buildCallContext,
  resolveRecordingFromActivity,
  type DealContext,
} from "./bitrix";
import { transcribeFile } from "./transcribe";
import { analyzeCall, type CallAnalysis } from "./analyzer";
import { createReminderFromAnalysis } from "./reminders";
import { detectProduct, type ProductCandidate } from "./product-detector";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR
  ? path.resolve(process.env.RECORDINGS_DIR)
  : path.join(process.cwd(), "storage", "recordings");

export async function processCall(callId: number): Promise<void> {
  const db = getDbAsync();
  const row = await db.prepare(`SELECT * FROM calls WHERE id = ?`).get<CallRow>(callId);
  if (!row) throw new Error(`Call ${callId} не найден`);

  await db.prepare(`UPDATE calls SET attempts = attempts + 1 WHERE id = ?`).run(callId);

  // 0. Если транскрипт уже есть — переанализ, не платим Whisper заново.
  //    Полезно когда меняли скрипты / чек-листы и хотим переоценить старые звонки.
  const existingTranscript = await db
    .prepare(`SELECT text, segments_json, language, model FROM transcripts WHERE call_id = ?`)
    .get<{ text: string; segments_json: string | null; language: string | null; model: string | null }>(callId);

  // Тип взаимодействия определяет ветку pipeline.
  // call → старый путь (download → transcribe)
  // chat/email → text-only (используем content_text, без аудио)
  // meeting → если есть recording — транскрибируем, иначе content_text
  const interactionType = (row.interaction_type ?? "call") as "call" | "chat" | "email" | "meeting";
  const isTextOnly = (interactionType === "chat" || interactionType === "email") ||
                     (interactionType === "meeting" && !row.recording_url && !row.recording_path);

  // 1. Скачать запись — пропускаем для text-only и если транскрипт уже есть
  let recordingPath = row.recording_path;
  if (!isTextOnly && !recordingPath && !existingTranscript) {
    await setCallStatus(callId, "downloading");

    // Резолвим recording_url если пуст:
    // для внешних АТС (Телфин и т.п.) в voximplant.statistic.get URL=null,
    // а файл лежит в crm.activity.FILES[0].url
    let recordingUrl = row.recording_url;
    if (!recordingUrl && row.bitrix_activity_id && row.bitrix_activity_id !== "0") {
      recordingUrl = await resolveRecordingFromActivity(row.bitrix_activity_id);
      if (recordingUrl) {
        await db.prepare(`UPDATE calls SET recording_url = ? WHERE id = ?`).run(recordingUrl, callId);
      }
    }
    if (!recordingUrl) {
      const reason = !row.bitrix_activity_id || row.bitrix_activity_id === "0"
        ? "звонок не привязан к Activity"
        : "не нашли FILES в Activity (запись отсутствует)";
      // Это не техническая ошибка — запись могла не сохраниться или ещё не подгрузилась
      throw new NoRecordingError(`Нет recording_url: ${reason}`);
    }

    recordingPath = await downloadRecording(
      recordingUrl,
      RECORDINGS_DIR,
      String(row.bitrix_call_id ?? callId)
    );
    await db.prepare(`UPDATE calls SET recording_path = ? WHERE id = ?`).run(recordingPath, callId);
  }

  // 2. Получение текста взаимодействия. Три источника по приоритету:
  //    a) кэш в transcripts (после прошлой обработки)
  //    b) content_text для chat/email/meeting без аудио
  //    c) Whisper-транскрипция аудио
  let t: { text: string; language: string | null; segments: Array<{start:number;end:number;text:string}>; model: string };
  if (existingTranscript) {
    let segments: Array<{start:number;end:number;text:string}> = [];
    try { segments = JSON.parse(existingTranscript.segments_json || "[]"); } catch {}
    t = {
      text: existingTranscript.text,
      language: existingTranscript.language,
      segments,
      model: existingTranscript.model || "cached",
    };
    console.log(`[pipeline] #${callId} (${interactionType}): используем кэшированный текст (${t.text.length} симв.)`);
  } else if (isTextOnly) {
    // chat/email/meeting без аудио — текст уже лежит в content_text
    const txt = (row.content_text || "").trim();
    if (!txt) {
      throw new Error(`Тип ${interactionType} без content_text — нечего анализировать`);
    }
    t = { text: txt, language: "ru", segments: [], model: "text-only" };
    console.log(`[pipeline] #${callId} (${interactionType}): text-only, ${txt.length} симв., Whisper пропускаем`);
  } else {
    await setCallStatus(callId, "transcribing");
    if (!recordingPath) throw new Error(`recordingPath не найден на этапе транскрипции`);
    t = await transcribeFile(recordingPath, { tenantId: row.tenant_id ?? 1, callId });
  }

  // 3. Контекст сделки — параллельно с шагом 4 не получится, потому что Claude его использует
  await setCallStatus(callId, "analyzing");
  const context: DealContext | null = await buildCallContext({
    bitrixDealId: row.bitrix_deal_id,
    bitrixLeadId: row.bitrix_lead_id,
  });
  if (context) {
    await db.prepare(`UPDATE calls SET deal_context_json = ? WHERE id = ?`).run(
      JSON.stringify(context),
      callId
    );
  }

  // 4. Определяем продукт + выбираем подходящий скрипт
  const { product, script } = await pickScriptForCall(t.text, row.direction, {
    tenantId: row.tenant_id ?? 1,
    callId,
  });
  if (product) {
    await db.prepare(`UPDATE calls SET detected_product = ? WHERE id = ?`).run(product, callId);
  }
  const checklist = script?.checklist || null;

  // 5. Анализ с выбранным чек-листом. tenantId/callId — для §4.4 бюджет-гарда.
  //    interactionType подстраивает терминологию (звонок vs переписка vs встреча).
  const { analysis, raw, model } = await analyzeCall({
    transcript: t.text,
    checklist,
    context,
    tenantId: row.tenant_id ?? 1,
    callId,
    interactionType,
  });

  // 5. Сохраняем транскрипт + диалог
  await db.prepare(
    `INSERT INTO transcripts (call_id, text, segments_json, dialogue_json, language, model)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       text=excluded.text, segments_json=excluded.segments_json,
       dialogue_json=excluded.dialogue_json,
       language=excluded.language, model=excluded.model, created_at=datetime('now')`
  ).run(
    callId,
    t.text,
    JSON.stringify(t.segments),
    JSON.stringify(analysis.dialogue || []),
    t.language,
    t.model
  );

  // FTS5 индекс отключён — поиск идёт через LIKE по transcripts.text

  // 6. Сохраняем анализ
  await db.prepare(
    `INSERT INTO analyses (call_id, summary, sentiment, manager_score, script_compliance,
       next_action, objections_json, topics_json, raw_json, model,
       client_name, checklist_scores_json, detected_product, coaching_tips_json, call_stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       summary=excluded.summary, sentiment=excluded.sentiment,
       manager_score=excluded.manager_score, script_compliance=excluded.script_compliance,
       next_action=excluded.next_action, objections_json=excluded.objections_json,
       topics_json=excluded.topics_json, raw_json=excluded.raw_json, model=excluded.model,
       client_name=excluded.client_name, checklist_scores_json=excluded.checklist_scores_json,
       detected_product=excluded.detected_product,
       coaching_tips_json=excluded.coaching_tips_json,
       call_stage=excluded.call_stage,
       created_at=datetime('now')`
  ).run(
    callId,
    analysis.summary,
    analysis.sentiment,
    analysis.manager_score,
    analysis.checklist_compliance,
    analysis.next_action,
    JSON.stringify(analysis.objections ?? []),
    JSON.stringify(analysis.topics ?? []),
    raw,
    model,
    analysis.client_name ?? null,
    JSON.stringify(analysis.checklist_scores ?? []),
    product ?? null,
    JSON.stringify(analysis.coaching_tips ?? []),
    analysis.call_stage ?? "cold"
  );

  // 6.5. §5.3 MASTER-TZ: создаём reminder из next_action если есть распознаваемый срок.
  //      Тихо игнорируем если парсер не распознал — это нормально, не все next_action имеют дату.
  try {
    await createReminderFromAnalysis({
      tenantId: row.tenant_id ?? 1,
      callId,
      bitrixManagerId: row.manager_id,
      nextAction: analysis.next_action || "",
      clientName: analysis.client_name,
      clientPhone: row.client_phone,
    });
  } catch (e) {
    console.warn(`[reminders] auto-create failed for call #${callId}:`, (e as Error).message);
  }

  // 7. Sync back в Bitrix — пропускаем если DRY_RUN или нет webhook URL
  await setCallStatus(callId, "syncing");
  const dryRun = process.env.BITRIX_DRY_RUN === "true";
  const hasWebhook = !!process.env.BITRIX_WEBHOOK_URL?.trim();
  if (dryRun || !hasWebhook) {
    const reason = dryRun ? "BITRIX_DRY_RUN=true" : "BITRIX_WEBHOOK_URL не задан";
    await db.prepare(`UPDATE calls SET error = ? WHERE id = ?`).run(
      `sync skipped: ${reason}`,
      callId
    );
    console.log(`[pipeline] call #${callId}: sync to Bitrix SKIPPED (${reason})`);
  } else {
    try {
      await syncBackToBitrix(row, analysis);
      // успех — очищаем поле error (если там был warning из прошлого прогона)
      await db.prepare(`UPDATE calls SET error = NULL WHERE id = ?`).run(callId);
    } catch (e) {
      await db.prepare(`UPDATE calls SET error = ? WHERE id = ?`).run(
        `sync warning: ${(e as Error).message}`,
        callId
      );
    }
  }

  await setCallStatus(callId, "done");
}

interface ResolvedScript {
  id: number;
  name: string;
  product: string | null;
  direction: string;
  checklist: ChecklistItem[] | null;
}

async function loadActiveScripts(): Promise<ResolvedScript[]> {
  const rows = await getDbAsync()
    .prepare(`SELECT id, name, product, direction, checklist_json FROM sales_scripts WHERE is_active = 1`)
    .all<{ id: number; name: string; product: string | null; direction: string | null; checklist_json: string | null }>();
  return rows.map((r) => {
    let checklist: ChecklistItem[] | null = null;
    if (r.checklist_json) {
      try {
        const parsed = JSON.parse(r.checklist_json) as ChecklistItem[];
        if (Array.isArray(parsed) && parsed.length > 0) checklist = parsed;
      } catch {}
    }
    return {
      id: r.id,
      name: r.name,
      product: r.product,
      direction: r.direction || "all",
      checklist,
    };
  });
}

/**
 * Определяет продукт по транскрипту и выбирает подходящий скрипт.
 * Приоритет:
 *  1. Точное совпадение product + direction
 *  2. Общий (без product) + direction
 *  3. Любой общий
 *  4. Любой активный (fallback)
 */
async function pickScriptForCall(
  transcript: string,
  callDirection: "in" | "out" | null,
  opts: { tenantId?: number; callId?: number } = {}
): Promise<{ product: string | null; script: ResolvedScript | null }> {
  const scripts = await loadActiveScripts();
  if (scripts.length === 0) return { product: null, script: null };

  const productCodes = [...new Set(scripts.map((s) => s.product).filter((p): p is string => !!p))];
  const candidates: ProductCandidate[] = productCodes.map((code) => ({
    code, name: code, keywords: [],
  }));

  let product: string | null = null;
  if (candidates.length > 1) {
    try { product = await detectProduct(transcript, candidates, opts); }
    catch (e) { console.warn("[pipeline] detectProduct failed:", (e as Error).message); }
  } else if (candidates.length === 1) {
    product = candidates[0].code;
  }

  const directionMatches = (s: ResolvedScript) =>
    s.direction === "all" || s.direction === callDirection;

  if (product) {
    const exact = scripts.find((s) => s.product === product && directionMatches(s));
    if (exact) return { product, script: exact };
  }
  const generalWithDir = scripts.find((s) => !s.product && directionMatches(s));
  if (generalWithDir) return { product, script: generalWithDir };
  const anyGeneral = scripts.find((s) => !s.product);
  if (anyGeneral) return { product, script: anyGeneral };
  return { product, script: scripts[0] };
}

async function syncBackToBitrix(row: CallRow, analysis: CallAnalysis) {
  const ownerType = entityTypeStringToId(
    row.bitrix_deal_id ? "DEAL" :
    row.bitrix_lead_id ? "LEAD" :
    row.bitrix_contact_id ? "CONTACT" : null
  );
  const ownerId = row.bitrix_deal_id || row.bitrix_lead_id || row.bitrix_contact_id;
  if (!ownerType || !ownerId) return;

  const sentimentLabel =
    analysis.sentiment === "positive" ? "положительное" :
    analysis.sentiment === "negative" ? "отрицательное" : "нейтральное";

  const checklistBlock = (analysis.checklist_scores || [])
    .map((c) => {
      const pct = Math.round(c.score * 100);
      const mark = c.score >= 0.8 ? "[V]" : c.score >= 0.4 ? "[~]" : "[X]";
      return `${mark} ${c.title} — ${pct}% ${c.notes ? `(${c.notes})` : ""}`;
    })
    .join("\n") || "—";

  const comment = `[B]Анализ звонка (Call-Agent)[/B]
Настроение: ${sentimentLabel}
Оценка менеджера: ${analysis.manager_score}/10
Чек-лист QC: ${Math.round((analysis.checklist_compliance || 0) * 100)}%
${analysis.client_name ? `Клиент: ${analysis.client_name}` : ""}

[B]Краткое содержание:[/B]
${analysis.summary}

[B]Что хочет клиент:[/B] ${analysis.client_intent}

[B]Возражения:[/B]
${(analysis.objections || []).map((o) => `- ${o}`).join("\n") || "—"}

[B]По чек-листу:[/B]
${checklistBlock}

[B]Темы:[/B] ${(analysis.topics || []).join(", ") || "—"}

[B]Следующий шаг:[/B] ${analysis.next_action}

-----
[I]Полная стенограмма и диалог сохранены в Call-Agent.[/I]`;

  await crmTimelineCommentAdd({
    entityTypeId: ownerType,
    entityId: ownerId,
    comment,
  });
}
