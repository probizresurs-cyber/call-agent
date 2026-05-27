import path from "path";
import { getDb, setCallStatus, type CallRow, type ChecklistItem } from "./db";
import {
  downloadRecording,
  crmTimelineCommentAdd,
  entityTypeStringToId,
  buildCallContext,
  type DealContext,
} from "./bitrix";
import { transcribeFile } from "./transcribe";
import { analyzeCall, type CallAnalysis } from "./analyzer";

const RECORDINGS_DIR = process.env.RECORDINGS_DIR
  ? path.resolve(process.env.RECORDINGS_DIR)
  : path.join(process.cwd(), "storage", "recordings");

export async function processCall(callId: number): Promise<void> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM calls WHERE id = ?`).get(callId) as CallRow | undefined;
  if (!row) throw new Error(`Call ${callId} не найден`);

  db.prepare(`UPDATE calls SET attempts = attempts + 1 WHERE id = ?`).run(callId);

  // 1. Скачать запись
  let recordingPath = row.recording_path;
  if (!recordingPath) {
    if (!row.recording_url) throw new Error(`У звонка ${callId} нет recording_url`);
    setCallStatus(callId, "downloading");
    recordingPath = await downloadRecording(
      row.recording_url,
      RECORDINGS_DIR,
      String(row.bitrix_call_id ?? callId)
    );
    db.prepare(`UPDATE calls SET recording_path = ? WHERE id = ?`).run(recordingPath, callId);
  }

  // 2. Транскрипция
  setCallStatus(callId, "transcribing");
  const t = await transcribeFile(recordingPath);

  // 3. Контекст сделки — параллельно с шагом 4 не получится, потому что Claude его использует
  setCallStatus(callId, "analyzing");
  const context: DealContext | null = await buildCallContext({
    bitrixDealId: row.bitrix_deal_id,
    bitrixLeadId: row.bitrix_lead_id,
  });
  if (context) {
    db.prepare(`UPDATE calls SET deal_context_json = ? WHERE id = ?`).run(
      JSON.stringify(context),
      callId
    );
  }

  // 4. Анализ
  const checklist = loadActiveChecklist();
  const { analysis, raw, model } = await analyzeCall({
    transcript: t.text,
    checklist,
    context,
  });

  // 5. Сохраняем транскрипт + диалог
  db.prepare(
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

  db.prepare(`DELETE FROM transcripts_fts WHERE call_id = ?`).run(callId);
  db.prepare(`INSERT INTO transcripts_fts (call_id, text) VALUES (?, ?)`).run(callId, t.text);

  // 6. Сохраняем анализ
  db.prepare(
    `INSERT INTO analyses (call_id, summary, sentiment, manager_score, script_compliance,
       next_action, objections_json, topics_json, raw_json, model,
       client_name, checklist_scores_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       summary=excluded.summary, sentiment=excluded.sentiment,
       manager_score=excluded.manager_score, script_compliance=excluded.script_compliance,
       next_action=excluded.next_action, objections_json=excluded.objections_json,
       topics_json=excluded.topics_json, raw_json=excluded.raw_json, model=excluded.model,
       client_name=excluded.client_name, checklist_scores_json=excluded.checklist_scores_json,
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
    JSON.stringify(analysis.checklist_scores ?? [])
  );

  // 7. Sync back в Bitrix
  setCallStatus(callId, "syncing");
  try {
    await syncBackToBitrix(row, analysis);
  } catch (e) {
    db.prepare(`UPDATE calls SET error = ? WHERE id = ?`).run(
      `sync warning: ${(e as Error).message}`,
      callId
    );
  }

  setCallStatus(callId, "done");
}

function loadActiveChecklist(): ChecklistItem[] | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT checklist_json FROM sales_scripts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1`)
    .get() as { checklist_json: string | null } | undefined;
  if (!row?.checklist_json) return null;
  try {
    const parsed = JSON.parse(row.checklist_json) as ChecklistItem[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function syncBackToBitrix(row: CallRow, analysis: CallAnalysis) {
  const ownerType = entityTypeStringToId(
    row.bitrix_deal_id ? "DEAL" :
    row.bitrix_lead_id ? "LEAD" :
    row.bitrix_contact_id ? "CONTACT" : null
  );
  const ownerId = row.bitrix_deal_id || row.bitrix_lead_id || row.bitrix_contact_id;
  if (!ownerType || !ownerId) return;

  const sentimentEmoji =
    analysis.sentiment === "positive" ? "🟢" :
    analysis.sentiment === "negative" ? "🔴" : "🟡";

  const checklistBlock = (analysis.checklist_scores || [])
    .map((c) => {
      const pct = Math.round(c.score * 100);
      const tick = c.score >= 0.8 ? "✅" : c.score >= 0.4 ? "🟡" : "❌";
      return `${tick} ${c.title} — ${pct}% ${c.notes ? `(${c.notes})` : ""}`;
    })
    .join("\n") || "—";

  const comment = `[B]Анализ звонка (Call-Agent)[/B]
${sentimentEmoji} Настроение: ${analysis.sentiment}
⭐ Оценка менеджера: ${analysis.manager_score}/10
📋 Чек-лист QC: ${Math.round((analysis.checklist_compliance || 0) * 100)}%
${analysis.client_name ? `👤 Клиент: ${analysis.client_name}` : ""}

[B]Краткое содержание:[/B]
${analysis.summary}

[B]Что хочет клиент:[/B] ${analysis.client_intent}

[B]Возражения:[/B]
${(analysis.objections || []).map((o) => `• ${o}`).join("\n") || "—"}

[B]По чек-листу:[/B]
${checklistBlock}

[B]Темы:[/B] ${(analysis.topics || []).join(", ") || "—"}

[B]Следующий шаг:[/B] ${analysis.next_action}

—————
[I]Полная стенограмма и диалог сохранены в Call-Agent.[/I]`;

  await crmTimelineCommentAdd({
    entityTypeId: ownerType,
    entityId: ownerId,
    comment,
  });
}
