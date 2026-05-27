import fs from "fs";
import OpenAI from "openai";

const WHISPER_MODEL = "whisper-1"; // у OpenAI это пока самая стабильная транскрипция

export interface TranscribeResult {
  text: string;
  language: string | null;
  segments: Array<{ start: number; end: number; text: string }>;
  model: string;
}

export async function transcribeFile(filePath: string): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY не задан");
  if (!fs.existsSync(filePath)) throw new Error(`Файл записи не найден: ${filePath}`);

  const client = new OpenAI({ apiKey });

  // OpenAI Node SDK принимает поток / file
  const res = await client.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: WHISPER_MODEL,
    language: "ru",
    response_format: "verbose_json",
    temperature: 0,
  });

  // verbose_json содержит segments[]; SDK типизирует это как any в текущей версии
  const raw = res as unknown as {
    text: string;
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    text: raw.text || "",
    language: raw.language ?? null,
    segments: raw.segments ?? [],
    model: WHISPER_MODEL,
  };
}
