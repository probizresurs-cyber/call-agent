import Anthropic from "@anthropic-ai/sdk";
import type { ChecklistItem, ChecklistItemScore, DialogueTurn } from "./db";
import type { DealContext } from "./bitrix";

const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface CallAnalysis {
  client_name: string | null;
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  client_intent: string;
  objections: string[];
  manager_score: number;             // 0..10 (агрегированная)
  manager_score_reason: string;
  checklist_compliance: number;      // 0..1 (взвешенное среднее checklist_scores)
  checklist_scores: ChecklistItemScore[];
  next_action: string;
  topics: string[];
  dialogue: DialogueTurn[];          // псевдо-диаризация по тексту
}

const SYSTEM_PROMPT = `Ты — эксперт по B2B-продажам и контролю качества call-центра.
Анализируешь стенограмму одного телефонного разговора менеджера с клиентом.
Если дан чек-лист QC — оцениваешь каждый его пункт независимо (0..1).
Если дан контекст сделки/лида — используешь его как фон для оценки.
Также делаешь псевдо-диаризацию: размечаешь, кто говорит каждую реплику
(manager / client / unknown) по косвенным признакам (приветствие, кто
задаёт вопросы о продукте, кто называет цены и условия — это менеджер;
кто спрашивает о цене, сроках, гарантии — это клиент).
Возвращай СТРОГО JSON без преамбулы и без markdown-обёртки.`;

function userPrompt(args: {
  transcript: string;
  checklist: ChecklistItem[] | null;
  context: DealContext | null;
}) {
  const { transcript, checklist, context } = args;

  const checklistBlock =
    checklist && checklist.length > 0
      ? `Чек-лист QC (оцени каждый пункт от 0 до 1; 1 = выполнено полностью, 0 = не выполнено вообще, weight — важность от 1 до 5):
${JSON.stringify(checklist, null, 2)}`
      : `Чек-листа нет — оцени стандартные пункты: приветствие, выявление потребности, презентация выгод, отработка возражений, договорённость о следующем шаге. Сформируй checklist_scores из этих 5 пунктов.`;

  const contextBlock = context
    ? `Контекст ${context.kind === "deal" ? "сделки" : "лида"}:
- Название: ${context.title ?? "—"}
- Стадия: ${context.stage ?? "—"}
- Сумма: ${context.opportunity ?? "—"}
- Создана: ${context.createdAt ?? "—"}
- Последние ${context.recentComments.length} комментариев таймлайна:
${context.recentComments.map((c) => `  • ${c.createdAt}: ${c.text.slice(0, 300)}`).join("\n") || "  —"}
- Прошлые активности (звонки/встречи): ${context.priorActivities.length}
`
    : "Контекст сделки/лида не получен (звонок не привязан к CRM или внешний вебхук ещё не подключён).";

  return `${contextBlock}

${checklistBlock}

Стенограмма звонка:
"""
${transcript}
"""

Верни JSON:
{
  "client_name": "Иван" | null,
  "summary": "3-5 предложений по сути разговора",
  "sentiment": "positive" | "neutral" | "negative",
  "client_intent": "что хочет клиент одной фразой",
  "objections": ["возражение1", "возражение2"],
  "manager_score": 0..10,
  "manager_score_reason": "короткое обоснование",
  "checklist_compliance": 0..1,
  "checklist_scores": [
    {"id":"<id_пункта>","title":"<копия title>","score":0..1,"notes":"что сделано/упущено"}
  ],
  "next_action": "рекомендованный следующий шаг для менеджера",
  "topics": ["цена","сроки","гарантия", ...],
  "dialogue": [
    {"speaker":"manager"|"client"|"unknown","text":"реплика дословно или близко к тексту"}
  ]
}`;
}

export async function analyzeCall(args: {
  transcript: string;
  checklist: ChecklistItem[] | null;
  context: DealContext | null;
}): Promise<{ analysis: CallAnalysis; raw: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY не задан");

  const client = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  const msg = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(args) }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const json = extractJson(text);
  const parsed = JSON.parse(json) as CallAnalysis;

  // Нормализация на случай если Claude ушёл от схемы
  parsed.dialogue ||= [];
  parsed.checklist_scores ||= [];
  parsed.objections ||= [];
  parsed.topics ||= [];

  return { analysis: parsed, raw: text, model: CLAUDE_MODEL };
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("В ответе модели не найден JSON");
  return s.slice(start, end + 1);
}
