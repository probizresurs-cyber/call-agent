import Anthropic from "@anthropic-ai/sdk";
import type { ChecklistItem, ChecklistItemScore, DialogueTurn } from "./db";
import type { DealContext } from "./bitrix";
import { checkBudget, recordUsage } from "./budget";

const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface CallAnalysis {
  client_name: string | null;
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  client_intent: string;
  objections: string[];
  manager_score: number;             // 0..10
  manager_score_reason: string;
  checklist_compliance: number;      // 0..1
  checklist_scores: ChecklistItemScore[];
  next_action: string;
  topics: string[];
  dialogue: DialogueTurn[];
}

const SYSTEM_PROMPT = `Ты — эксперт по B2B-продажам и контролю качества call-центра.
Анализируешь стенограмму одного телефонного разговора менеджера с клиентом.
Если дан чек-лист QC — оцениваешь каждый его пункт независимо (0..1).
Если дан контекст сделки/лида — используешь его как фон для оценки.
Также делаешь псевдо-диаризацию: размечаешь, кто говорит каждую реплику
(manager / client / unknown) по косвенным признакам.
Используй инструмент save_analysis для возврата результата.`;

// JSON Schema для tool_use — Anthropic SDK сам валидирует структуру
const SAVE_ANALYSIS_TOOL: Anthropic.Tool = {
  name: "save_analysis",
  description: "Сохранить структурированный анализ звонка",
  input_schema: {
    type: "object",
    properties: {
      client_name: {
        type: ["string", "null"] as unknown as "string",  // SDK type quirk
        description: "Имя клиента если упомянуто в разговоре, иначе null",
      },
      summary: {
        type: "string",
        description: "3-5 предложений по сути разговора",
      },
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative"],
      },
      client_intent: {
        type: "string",
        description: "Что хочет клиент одной фразой",
      },
      objections: {
        type: "array",
        items: { type: "string" },
        description: "Возражения клиента",
      },
      manager_score: {
        type: "number",
        minimum: 0,
        maximum: 10,
        description: "Оценка работы менеджера от 0 до 10",
      },
      manager_score_reason: {
        type: "string",
        description: "Короткое обоснование оценки",
      },
      checklist_compliance: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Взвешенное среднее по чек-листу (0..1)",
      },
      checklist_scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            score: { type: "number", minimum: 0, maximum: 1 },
            notes: { type: "string" },
            block: { type: "string" },
          },
          required: ["id", "title", "score", "notes"],
        },
      },
      next_action: {
        type: "string",
        description: "Рекомендованный следующий шаг для менеджера",
      },
      topics: {
        type: "array",
        items: { type: "string" },
        description: "Темы разговора",
      },
      dialogue: {
        type: "array",
        items: {
          type: "object",
          properties: {
            speaker: { type: "string", enum: ["manager", "client", "unknown"] },
            text: { type: "string" },
          },
          required: ["speaker", "text"],
        },
      },
    },
    required: [
      "summary", "sentiment", "client_intent", "objections",
      "manager_score", "manager_score_reason",
      "checklist_compliance", "checklist_scores",
      "next_action", "topics", "dialogue",
    ],
  } as Anthropic.Tool["input_schema"],
};

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
      : `Чек-листа нет — оцени стандартные пункты: приветствие, выявление потребности, презентация выгод, отработка возражений, договорённость о следующем шаге. Сформируй checklist_scores из этих 5 пунктов (id: greeting, needs, pitch, objections, next_step).`;

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
    : "Контекст сделки/лида не получен.";

  return `${contextBlock}

${checklistBlock}

Стенограмма звонка:
"""
${transcript}
"""

Вызови инструмент save_analysis со всеми обязательными полями.
Для dialogue — псевдо-диаризация: размети каждую реплику по косвенным признакам
(приветствие, вопросы о продукте, цене, сроках — это менеджер; вопросы о цене, гарантии — это клиент).`;
}

/**
 * Retry wrapper для 429 (rate_limit) и 529 (overloaded).
 * Anthropic возвращает эти коды когда модель временно перегружена/лимитирована.
 * Backoff: 3s → 9s → 27s. После 3 неудачных попыток — пробрасываем ошибку наверх.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const err = e as { status?: number; message?: string };
      const status = err.status ?? 0;
      const msg = err.message ?? "";
      const isRetryable =
        status === 429 || status === 529 ||
        /overloaded/i.test(msg) || /rate.?limit/i.test(msg);
      if (!isRetryable || attempt === maxAttempts) throw e;
      const delayMs = 3000 * Math.pow(3, attempt - 1); // 3s, 9s, 27s
      console.warn(`[${label}] attempt ${attempt}/${maxAttempts} failed (${status} ${msg.slice(0, 80)}), retry in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function analyzeCall(args: {
  transcript: string;
  checklist: ChecklistItem[] | null;
  context: DealContext | null;
  tenantId?: number;  // §4.4 для бюджет-гарда; если не передан — без учёта расхода
  callId?: number;    // для usage_events.call_id (опционально, аналитика)
}): Promise<{ analysis: CallAnalysis; raw: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY не задан");

  // §4.4 Бюджет-гард: ДО запроса проверяем не исчерпан ли лимит токенов на тенант.
  if (args.tenantId) {
    await checkBudget(args.tenantId, "anthropic_tokens");  // бросает BudgetExceededError если 'stop'
  }

  const client = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });

  const msg = await withRetry("analyzer", () => client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [SAVE_ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: "save_analysis" },
    messages: [{ role: "user", content: userPrompt(args) }],
  }));

  // §4.4 Учёт расхода: суммируем input + output токены. Запись идёт через try/catch — не валит звонок.
  if (args.tenantId) {
    const total = (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);
    await recordUsage(args.tenantId, "anthropic_tokens", total, args.callId);
  }

  // Извлекаем tool_use блок — он содержит уже распарсенный JSON
  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "save_analysis"
  );

  if (!toolUse) {
    throw new Error("Claude не вызвал save_analysis tool — модель отказала или вернула только текст");
  }

  const parsed = toolUse.input as CallAnalysis;

  // Нормализация — на случай если модель не дала какое-то опциональное поле
  parsed.client_name = parsed.client_name ?? null;
  parsed.dialogue ||= [];
  parsed.checklist_scores ||= [];
  parsed.objections ||= [];
  parsed.topics ||= [];

  return {
    analysis: parsed,
    raw: JSON.stringify(parsed),  // для логов / debugging
    model: CLAUDE_MODEL,
  };
}
