import type { ChecklistItem, ChecklistItemScore, DialogueTurn } from "./db";
import type { DealContext } from "./bitrix";
import { callWithTool } from "./ai-provider";

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
  coaching_tips: string[];  // §5.2 MASTER-TZ: 1-3 доброжелательных совета на следующий звонок
  // Тип звонка для выбора чек-листа. AI определяет по контексту:
  //   cold — первичный/холодный (нет действующей сделки)
  //   qualification — выявление потребности (могут быть несколько касаний)
  //   deal_followup — звонок по уже открытой сделке (есть конкретный объект/КП/договорённости)
  //   informational — не продажный (статус, уточнение, тех.вопрос)
  //   no_contact — клиент не взял трубку или сразу повесил (< 15 сек разговора)
  call_stage: "cold" | "qualification" | "deal_followup" | "informational" | "no_contact";
}

const SYSTEM_PROMPT = `Ты — эксперт по B2B-продажам и контролю качества call-центра.
Анализируешь стенограмму одного телефонного разговора менеджера с заказчиком.

ВАЖНО: сначала определи call_stage — этап звонка:
- cold: впервые контактируешь, истории отношений нет
- qualification: выясняешь потребности/бюджет/ЛПР, сделки ещё нет
- deal_followup: уже есть открытая сделка/КП/договорённости — звонок чтобы двинуть к закрытию
- informational: статус/технический вопрос, не продажный
- no_contact: клиент не взял или сразу повесил

Оценивай менеджера СТРОГО ПОД ЭТАП. Нельзя снижать оценку за «не закрыл сделку» если был cold-звонок —
у холодного звонка цель не закрытие, а выявление потребности и договорённость о следующем шаге.
Подобным образом: если был deal_followup — пункты типа «представился впервые» нерелевантны.

Если дан чек-лист QC — оцениваешь каждый его пункт независимо (0..1) С УЧЁТОМ этапа.
Если пункт чек-листа не применим к этапу (например «закрытие сделки» в cold-звонке) —
ставь score=null или 1.0 и в notes пометь «нерелевантно для cold-звонка».

Если дан контекст сделки/лида — используешь его как фон для оценки.
Также делаешь псевдо-диаризацию (manager/client/unknown) по косвенным признакам.

Используй инструмент save_analysis для возврата результата.`;

// JSON Schema для tool_use — одинаковый для OpenAI и Anthropic через ai-provider.callWithTool
const SAVE_ANALYSIS_SCHEMA = {
    type: "object",
    properties: {
      client_name: {
        type: ["string", "null"] as unknown as "string",  // SDK type quirk
        description: "Имя заказчика если упомянуто в разговоре, иначе null",
      },
      summary: {
        type: "string",
        description:
          "Телеграфно, 1-2 предложения: «<заказчик> о <теме>. <результат>». " +
          "Только факты, без оценок. Запрещены: «в ходе», «состоялся разговор», " +
          "«обсудили», «была затронута тема».",
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
        description: "Возражения заказчика",
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
      coaching_tips: {
        type: "array",
        items: { type: "string" },
        description: "1-3 конкретных, доброжелательных совета менеджеру на следующий звонок. Тон — помощь и подсказка, НЕ ярлык «плохой сотрудник». Формат: «Попробуйте X», «В следующий раз можно Y», «Обратите внимание на Z». Не давать общих советов типа «работайте лучше». Если звонок был полностью успешным — отметить что менеджер сделал хорошо.",
      },
      call_stage: {
        type: "string",
        enum: ["cold", "qualification", "deal_followup", "informational", "no_contact"],
        description:
          "Этап звонка по контексту:\n" +
          "- cold: заказчика впервые слышит, нет истории отношений, менеджер устанавливает первичный контакт\n" +
          "- qualification: менеджер выясняет потребности, бюджет, ЛПР; сделки ещё нет\n" +
          "- deal_followup: уже есть открытая сделка/КП/конкретные договорённости — менеджер двигает её к закрытию\n" +
          "- informational: уточнение статуса, технический вопрос, не продажный\n" +
          "- no_contact: клиент не взял или сразу повесил, реального диалога нет\n" +
          "Чек-лист и оценка применяются СТРОГО под этот этап — нельзя ругать менеджера за «не закрыл сделку» если был cold-звонок.",
      },
    },
    required: [
      "summary", "sentiment", "client_intent", "objections",
      "manager_score", "manager_score_reason",
      "checklist_compliance", "checklist_scores",
      "next_action", "topics", "dialogue", "coaching_tips", "call_stage",
    ],
};

function userPrompt(args: {
  transcript: string;
  checklist: ChecklistItem[] | null;
  context: DealContext | null;
  interactionType?: "call" | "chat" | "email" | "meeting";
}) {
  const { transcript, checklist, context } = args;
  const itype = args.interactionType ?? "call";

  // Терминология подстраивается под тип взаимодействия — анализ остаётся тот же
  const labels = {
    call:    { noun: "звонок",    transcriptLabel: "Стенограмма звонка",        diarization: "сделай псевдо-диаризацию (manager/client/unknown)" },
    chat:    { noun: "переписка", transcriptLabel: "Текст переписки",            diarization: "если в тексте видно кто пишет (manager/client) — размечай; иначе ставь unknown" },
    email:   { noun: "email",     transcriptLabel: "Email-переписка",            diarization: "размечай по From/To если видно: получатель=client, отправитель из нашей компании=manager" },
    meeting: { noun: "встреча",   transcriptLabel: "Стенограмма видео-встречи", diarization: "псевдо-диаризация по контексту (manager/client/unknown)" },
  }[itype];

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

  return `Тип взаимодействия: ${labels.noun}. ${labels.diarization}.

${contextBlock}

${checklistBlock}

${labels.transcriptLabel}:
"""
${transcript}
"""

Вызови инструмент save_analysis со всеми обязательными полями.
Для dialogue — псевдо-диаризация: размети каждую реплику по косвенным признакам
(приветствие, вопросы о продукте, цене, сроках — это менеджер; вопросы о цене, гарантии — это клиент).`;
}

export async function analyzeCall(args: {
  transcript: string;
  checklist: ChecklistItem[] | null;
  context: DealContext | null;
  tenantId?: number;  // §4.4 для бюджет-гарда
  callId?: number;    // для usage_events.call_id
  interactionType?: "call" | "chat" | "email" | "meeting";  // §2 MASTER-TZ
  /** Per-tenant переопределение модели: 'provider:model', например 'openai:gpt-4o-mini'. */
  modelOverride?: string;
}): Promise<{ analysis: CallAnalysis; raw: string; model: string }> {
  // Провайдер AI выбирается через ENV AI_PROVIDER (openai | anthropic), default = openai.
  // modelOverride позволяет задать модель на уровне тенанта (из tenants.analysis_model).
  // Бюджет-гард и retry внутри callWithTool — единая логика для обоих провайдеров.
  const out = await callWithTool<CallAnalysis>({
    toolName: "save_analysis",
    schema: SAVE_ANALYSIS_SCHEMA,
    system: SYSTEM_PROMPT,
    user: userPrompt({ ...args, interactionType: args.interactionType }),
    modelTier: "premium",
    // 12000 = с запасом на dialogue для длинных звонков (10+ мин). GPT-4o max = 16384.
    // 4000 не хватало на 7-минутные разговоры — получали Unterminated string в JSON.
    maxTokens: 12000,
    tenantId: args.tenantId,
    callId: args.callId,
    modelOverride: args.modelOverride,
  });

  const parsed = out.result;

  // Нормализация — на случай если модель не дала какое-то опциональное поле
  parsed.client_name = parsed.client_name ?? null;
  parsed.dialogue ||= [];
  parsed.coaching_tips ||= [];
  parsed.call_stage = parsed.call_stage || "cold";
  parsed.checklist_scores ||= [];
  parsed.objections ||= [];
  parsed.topics ||= [];

  return {
    analysis: parsed,
    raw: out.rawResponseJson,
    model: `${out.provider}:${out.model}`,
  };
}
