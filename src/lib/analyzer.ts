import Anthropic from "@anthropic-ai/sdk";

const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface CallAnalysis {
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  client_intent: string;
  objections: string[];
  manager_score: number;          // 0..10
  manager_score_reason: string;
  script_compliance: number;      // 0..1
  script_compliance_notes: string;
  next_action: string;
  topics: string[];
}

const SYSTEM_PROMPT = `Ты — эксперт по B2B-продажам и контролю качества call-центра.
Анализируешь стенограмму одного телефонного разговора менеджера с клиентом.
Возвращай СТРОГО JSON по схеме без преамбулы и без markdown-обёртки.`;

function userPrompt(transcript: string, script?: string | null) {
  const scriptBlock = script
    ? `\nЭталонный скрипт продаж (для оценки compliance):\n"""\n${script}\n"""\n`
    : "";
  return `Стенограмма звонка:
"""
${transcript}
"""
${scriptBlock}
Верни JSON:
{
  "summary": "3-5 предложений о сути разговора",
  "sentiment": "positive" | "neutral" | "negative",
  "client_intent": "что хочет клиент одной фразой",
  "objections": ["возражение1", "возражение2"],
  "manager_score": 0..10,
  "manager_score_reason": "короткое обоснование оценки",
  "script_compliance": 0..1,
  "script_compliance_notes": "что менеджер сделал хорошо / что упустил из скрипта",
  "next_action": "рекомендованный следующий шаг для менеджера",
  "topics": ["цена", "сроки", "гарантия", ...]
}`;
}

export async function analyzeCall(
  transcript: string,
  script: string | null = null
): Promise<{ analysis: CallAnalysis; raw: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY не задан");

  const client = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(transcript, script) }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const json = extractJson(text);
  const parsed = JSON.parse(json) as CallAnalysis;
  return { analysis: parsed, raw: text, model: CLAUDE_MODEL };
}

function extractJson(s: string): string {
  // На случай если модель всё-таки обернула в ```json … ``` — выкусим первый JSON-объект
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("В ответе модели не найден JSON");
  return s.slice(start, end + 1);
}
