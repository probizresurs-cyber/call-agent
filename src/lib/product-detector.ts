/**
 * Лёгкий первый проход LLM (fast tier) для определения продукта по транскрипту.
 * Возвращает product = строка (e.g. "МП", "МК") или null если непонятно.
 *
 * Использует ai-provider.callWithTool — провайдер выбирается через ENV AI_PROVIDER.
 * Tier 'fast' = gpt-4o-mini (OpenAI) или claude-haiku-4-5 (Anthropic).
 */
import { callWithTool } from "./ai-provider";

export interface ProductCandidate {
  code: string;        // "МП" / "МК"
  name: string;        // "Металлопрокат"
  keywords: string[];  // признаки в речи
}

interface DetectResult {
  product_code: string;  // один из codes или "unknown"
}

export async function detectProduct(
  transcript: string,
  candidates: ProductCandidate[],
  opts: { tenantId?: number; callId?: number } = {}
): Promise<string | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].code;
  if (!transcript || transcript.length < 30) return null;

  const productsList = candidates
    .map((p) => `- ${p.code}: ${p.name}${p.keywords.length ? " (признаки: " + p.keywords.join(", ") + ")" : ""}`)
    .join("\n");

  const codes = candidates.map((p) => p.code);
  const snippet = transcript.length > 2000 ? transcript.slice(0, 2000) + "..." : transcript;

  const schema = {
    type: "object",
    properties: {
      product_code: {
        type: "string",
        enum: [...codes, "unknown"],
        description: "Код продукта который обсуждался в звонке, или 'unknown' если непонятно",
      },
    },
    required: ["product_code"],
  };

  const system = "Ты классификатор B2B-звонков. Отвечаешь только через инструмент save_detection. Никаких лишних слов.";
  const user = `Определи о каком продукте идёт речь в звонке. Возможные варианты:
${productsList}

Если разговор слишком короткий или непонятно — product_code='unknown'.
Если упоминаются оба продукта — верни тот о котором говорят больше.

Стенограмма:
"""
${snippet}
"""

Вызови save_detection с product_code.`;

  try {
    const out = await callWithTool<DetectResult>({
      toolName: "save_detection",
      schema,
      system,
      user,
      modelTier: "fast",
      maxTokens: 100,
      tenantId: opts.tenantId,
      callId: opts.callId,
    });
    const answer = (out.result.product_code || "").trim();
    if (!answer || answer.toLowerCase() === "unknown") {
      console.log(`[detect:${out.provider}:${out.model}] result="unknown" → null`);
      return null;
    }
    const match = candidates.find((p) => p.code.toLowerCase() === answer.toLowerCase());
    console.log(`[detect:${out.provider}:${out.model}] result="${answer}" → ${match ? match.code : "null"}`);
    return match?.code ?? null;
  } catch (e) {
    console.warn("[detect] failed:", (e as Error).message);
    return null;
  }
}
