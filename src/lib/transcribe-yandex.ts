/**
 * Запасная транскрипция через Yandex SpeechKit STT v3 (async, «длинное аудио»).
 * Включается как fallback, когда OpenAI Whisper недоступен (квота/биллинг/auth).
 *
 * Плюсы для нашего кейса: эндпоинт в РФ (без прокси), родной русский, биллинг ₽.
 *
 * Флоу (проверен на реальной записи):
 *  1) POST /stt/v3/recognizeFileAsync  (аудио inline base64) → operation id
 *  2) poll  operation.api.cloud.yandex.net/operations/{id}   → done:true
 *  3) GET  /stt/v3/getRecognition?operationId={id}           → NDJSON с результатами
 * Берём нормализованный текст (finalRefinement.normalizedText) — с пунктуацией/регистром.
 *
 * ENV: YANDEX_STT_API_KEY (обязателен), YANDEX_STT_FOLDER_ID (опционально).
 */
import fs from "fs";
import { recordUsage } from "./budget";
import type { TranscribeResult } from "./transcribe";

const STT_BASE = "https://stt.api.cloud.yandex.net/stt/v3";
const OP_BASE = "https://operation.api.cloud.yandex.net/operations";
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 5 * 60_000; // 5 минут на распознавание одного звонка

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function transcribeYandex(
  filePath: string,
  opts: { tenantId?: number; callId?: number } = {}
): Promise<TranscribeResult> {
  const key = process.env.YANDEX_STT_API_KEY?.trim();
  if (!key) throw new Error("YANDEX_STT_API_KEY не задан");
  if (!fs.existsSync(filePath)) throw new Error(`Файл записи не найден: ${filePath}`);

  const auth = { Authorization: `Api-Key ${key}` };
  const content = fs.readFileSync(filePath).toString("base64");

  // 1) submit
  const submitRes = await fetch(`${STT_BASE}/recognizeFileAsync`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      recognitionModel: {
        model: "general",
        audioFormat: { containerAudio: { containerAudioType: "MP3" } },
        textNormalization: {
          textNormalization: "TEXT_NORMALIZATION_ENABLED",
          profanityFilter: false,
          literatureText: true,
        },
        languageRestriction: { restrictionType: "WHITELIST", languageCode: ["ru-RU"] },
      },
    }),
  });
  const submit = (await submitRes.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!submitRes.ok || !submit.id) {
    throw new Error(`Yandex STT submit failed (${submitRes.status}): ${JSON.stringify(submit).slice(0, 200)}`);
  }
  const opId = submit.id;

  // 2) poll операции
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const opRes = await fetch(`${OP_BASE}/${opId}`, { headers: auth });
    const op = (await opRes.json().catch(() => ({}))) as { done?: boolean; error?: unknown };
    if (op.done) {
      if (op.error) throw new Error(`Yandex STT operation error: ${JSON.stringify(op.error).slice(0, 200)}`);
      break;
    }
  }

  // 3) забираем результат (NDJSON — по строке на событие)
  const recRes = await fetch(`${STT_BASE}/getRecognition?operationId=${opId}`, { headers: auth });
  const raw = await recRes.text();
  if (!recRes.ok) {
    throw new Error(`Yandex STT getRecognition failed (${recRes.status}): ${raw.slice(0, 200)}`);
  }

  // Собираем финальный текст: на каждый finalIndex берём нормализованный текст
  // (finalRefinement), иначе сырой (final). Порядок — по finalIndex.
  const byIndex = new Map<number, string>();
  let maxAudioMs = 0;
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let j: {
      result?: {
        final?: { alternatives?: Array<{ text?: string }> };
        finalRefinement?: { finalIndex?: string; normalizedText?: { alternatives?: Array<{ text?: string }> } };
        audioCursors?: { finalIndex?: string; receivedDataMs?: string };
      };
    };
    try { j = JSON.parse(s); } catch { continue; }
    const r = j.result;
    if (!r) continue;
    const recv = Number(r.audioCursors?.receivedDataMs ?? 0);
    if (recv > maxAudioMs) maxAudioMs = recv;
    if (r.finalRefinement) {
      const idx = Number(r.finalRefinement.finalIndex ?? 0);
      const t = r.finalRefinement.normalizedText?.alternatives?.[0]?.text;
      if (t) byIndex.set(idx, t); // нормализованный приоритетнее сырого
    } else if (r.final) {
      const idx = Number(r.audioCursors?.finalIndex ?? 0);
      const t = r.final.alternatives?.[0]?.text;
      if (t && !byIndex.has(idx)) byIndex.set(idx, t);
    }
  }

  const text = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => t)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Учёт расхода (секунды аудио) — отдельным kind, чтобы не мешать бюджету Whisper.
  if (opts.tenantId) {
    const seconds = maxAudioMs > 0 ? Math.round(maxAudioMs / 1000) : Math.floor(fs.statSync(filePath).size / 16000);
    try { await recordUsage(opts.tenantId, "yandex_stt_seconds", seconds, opts.callId); } catch { /* учёт не критичен */ }
  }

  return { text, language: "ru-RU", segments: [], model: "yandex:stt-v3" };
}
