/**
 * Лёгкий первый проход Claude для определения продукта по транскрипту.
 * Возвращает product = строка (e.g. "МП", "МК") или null если непонятно.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5"; // дешёвый и быстрый для классификации
const FALLBACK_MODEL = "claude-sonnet-4-6";

export interface ProductCandidate {
  code: string;        // "МП" / "МК"
  name: string;        // "Металлопрокат"
  keywords: string[];  // признаки в речи
}

export async function detectProduct(
  transcript: string,
  candidates: ProductCandidate[]
): Promise<string | null> {
  if (candidates.length === 0) return null;
  // Если только один продукт — нечего детектить
  if (candidates.length === 1) return candidates[0].code;
  if (!transcript || transcript.length < 30) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY не задан");
  const client = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  const productsList = candidates
    .map((p) => `- ${p.code}: ${p.name}${p.keywords.length ? " (признаки: " + p.keywords.join(", ") + ")" : ""}`)
    .join("\n");

  const codes = candidates.map((p) => `"${p.code}"`).join(", ");

  // Лимит транскрипта чтобы не тратить токены
  const snippet = transcript.length > 2000 ? transcript.slice(0, 2000) + "..." : transcript;

  const prompt = `Определи о каком продукте идёт речь в звонке. Возможные варианты:
${productsList}

Если разговор слишком короткий или непонятно о каком продукте речь — верни "unknown".
Если упоминаются оба продукта — верни тот о котором говорят больше.

Стенограмма:
"""
${snippet}
"""

Ответь ОДНИМ словом из списка: ${codes} или "unknown". Никаких пояснений.`;

  let modelUsed = MODEL;
  let answer = "";
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 20,
      messages: [{ role: "user", content: prompt }],
    });
    answer = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (e) {
    console.warn(`[detect] ${MODEL} failed, retry with ${FALLBACK_MODEL}:`, (e as Error).message);
    modelUsed = FALLBACK_MODEL;
    const msg = await client.messages.create({
      model: FALLBACK_MODEL,
      max_tokens: 20,
      messages: [{ role: "user", content: prompt }],
    });
    answer = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  // Чистим ответ от кавычек / точек
  answer = answer.replace(/["'.\s]/g, "").trim();
  if (!answer || answer.toLowerCase() === "unknown") return null;

  // Проверяем что ответ — один из ожидаемых кодов
  const match = candidates.find((p) => p.code.toLowerCase() === answer.toLowerCase());
  console.log(`[detect:${modelUsed}] result="${answer}" → ${match ? match.code : "null"}`);
  return match?.code ?? null;
}
