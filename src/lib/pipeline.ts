import path from "path";
import { getDb, setCallStatus, type CallRow } from "./db";
import { downloadRecording, crmTimelineCommentAdd, entityTypeStringToId } from "./bitrix";
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
  db.prepare(
    `INSERT INTO transcripts (call_id, text, segments_json, language, model)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       text=excluded.text, segments_json=excluded.segments_json,
       language=excluded.language, model=excluded.model, created_at=datetime('now')`
  ).run(callId, t.text, JSON.stringify(t.segments), t.language, t.model);

  // FTS — поддерживаем индекс вручную
  db.prepare(`DELETE FROM transcripts_fts WHERE call_id = ?`).run(callId);
  db.prepare(`INSERT INTO transcripts_fts (call_id, text) VALUES (?, ?)`).run(callId, t.text);

  // 3. Анализ
  setCallStatus(callId, "analyzing");
  const script = db
    .prepare(`SELECT content_md FROM sales_scripts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1`)
    .get() as { content_md: string } | undefined;
  const { analysis, raw, model } = await analyzeCall(t.text, script?.content_md ?? null);

  db.prepare(
    `INSERT INTO analyses (call_id, summary, sentiment, manager_score, script_compliance,
       next_action, objections_json, topics_json, raw_json, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       summary=excluded.summary, sentiment=excluded.sentiment,
       manager_score=excluded.manager_score, script_compliance=excluded.script_compliance,
       next_action=excluded.next_action, objections_json=excluded.objections_json,
       topics_json=excluded.topics_json, raw_json=excluded.raw_json, model=excluded.model,
       created_at=datetime('now')`
  ).run(
    callId,
    analysis.summary,
    analysis.sentiment,
    analysis.manager_score,
    analysis.script_compliance,
    analysis.next_action,
    JSON.stringify(analysis.objections ?? []),
    JSON.stringify(analysis.topics ?? []),
    raw,
    model
  );

  // 4. Sync back в Bitrix
  setCallStatus(callId, "syncing");
  try {
    await syncBackToBitrix(row, t.text, analysis);
  } catch (e) {
    // Не критично для статуса done — записываем как warning в error поле
    db.prepare(`UPDATE calls SET error = ? WHERE id = ?`).run(
      `sync warning: ${(e as Error).message}`,
      callId
    );
  }

  setCallStatus(callId, "done");
}

async function syncBackToBitrix(row: CallRow, transcript: string, analysis: CallAnalysis) {
  const ownerType = entityTypeStringToId(
    row.bitrix_deal_id ? "DEAL" : row.bitrix_lead_id ? "LEAD" : row.bitrix_contact_id ? "CONTACT" : null
  );
  const ownerId = row.bitrix_deal_id || row.bitrix_lead_id || row.bitrix_contact_id;
  if (!ownerType || !ownerId) return; // некуда писать — пропускаем

  const sentimentEmoji =
    analysis.sentiment === "positive" ? "🟢" : analysis.sentiment === "negative" ? "🔴" : "🟡";

  const comment = `[B]Анализ звонка (Call-Agent)[/B]
${sentimentEmoji} Настроение: ${analysis.sentiment}
⭐ Оценка менеджера: ${analysis.manager_score}/10
📋 Соблюдение скрипта: ${Math.round((analysis.script_compliance || 0) * 100)}%

[B]Краткое содержание:[/B]
${analysis.summary}

[B]Что хочет клиент:[/B] ${analysis.client_intent}

[B]Возражения:[/B]
${(analysis.objections || []).map((o) => `• ${o}`).join("\n") || "—"}

[B]Темы:[/B] ${(analysis.topics || []).join(", ") || "—"}

[B]Следующий шаг:[/B] ${analysis.next_action}

—————
[I]Полная стенограмма (${transcript.length} симв.) сохранена в Call-Agent.[/I]`;

  await crmTimelineCommentAdd({
    entityTypeId: ownerType,
    entityId: ownerId,
    comment,
  });
}
