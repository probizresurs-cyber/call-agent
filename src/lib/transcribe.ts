import fs from "fs";
import OpenAI from "openai";
import { checkBudget, recordUsage } from "./budget";

const WHISPER_MODEL = "whisper-1"; // у OpenAI это пока самая стабильная транскрипция

const MAX_ATTEMPTS = 4;          // 4 попытки = 4 шанса CF Worker запуститься из дружелюбного региона
const BASE_DELAY_MS = 3000;       // 3 сек, удваивается на каждой попытке

export interface TranscribeResult {
  text: string;
  language: string | null;
  segments: Array<{ start: number; end: number; text: string }>;
  model: string;
}

export async function transcribeFile(
  filePath: string,
  opts: { tenantId?: number; callId?: number } = {}
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY не задан");
  if (!fs.existsSync(filePath)) throw new Error(`Файл записи не найден: ${filePath}`);

  // §4.4 Бюджет-гард: проверяем лимит на минуты Whisper за месяц.
  if (opts.tenantId) {
    await checkBudget(opts.tenantId, "openai_seconds");
  }

  // OPENAI_BASE_URL — для прокси (Cloudflare Worker) обхода гео-блока РФ.
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const client = new OpenAI({ apiKey, baseURL });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: WHISPER_MODEL,
        language: "ru",
        response_format: "verbose_json",
        temperature: 0,
      });

      const raw = res as unknown as {
        text: string;
        language?: string;
        segments?: Array<{ start: number; end: number; text: string }>;
      };

      // §4.4 Учёт расхода: длительность аудио = последний segment.end (Whisper verbose_json даёт это).
      // Fallback: размер файла / 16 КБ-в-секунду ≈ грубая оценка (если segments пусты).
      if (opts.tenantId) {
        const lastSegment = raw.segments?.[raw.segments.length - 1];
        const seconds = lastSegment?.end ?? Math.floor(fs.statSync(filePath).size / 16000);
        await recordUsage(opts.tenantId, "openai_seconds", seconds, opts.callId);
      }

      return {
        text: raw.text || "",
        language: raw.language ?? null,
        segments: raw.segments ?? [],
        model: WHISPER_MODEL,
      };
    } catch (e) {
      lastError = e;
      const err = e as { status?: number; message?: string };
      // Ретраим только гео-блок 403 и network-ошибки (5xx, fetch errors).
      // Auth-ошибки (401, 400) — нет смысла повторять.
      const status = err.status ?? 0;
      const retriable =
        status === 403 ||
        status === 429 ||
        status >= 500 ||
        (err.message ?? "").includes("fetch") ||
        (err.message ?? "").includes("network");

      if (!retriable || attempt === MAX_ATTEMPTS) throw e;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s
      console.warn(
        `[transcribe] attempt ${attempt}/${MAX_ATTEMPTS} failed (${status} ${err.message?.slice(0, 80)}). Retry in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
