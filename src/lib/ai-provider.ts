/**
 * Абстракция провайдера AI с tool-use.
 *
 * Поддерживает 2 провайдера: 'openai' (default) и 'anthropic'.
 * Выбор: ENV AI_PROVIDER. Можно переопределить per-call через opts.provider.
 *
 * Зачем абстракция: чтобы не дублировать boilerplate (retry, budget, model param)
 * между analyzer.ts и product-detector.ts. И чтобы клиент мог сменить провайдера
 * одним переключателем в .env без правки кода.
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { checkBudget, recordUsage } from "./budget";

export type AiProvider = "openai" | "anthropic";

export interface ToolCallArgs {
  /**
   * Имя tool (для Anthropic — name, для OpenAI — function.name).
   * Совпадает с именем функции которую модель «вызывает» чтобы вернуть структуру.
   */
  toolName: string;
  /** JSON Schema параметров tool (одинаковый для обоих провайдеров) */
  schema: Record<string, unknown>;
  /** System prompt */
  system: string;
  /** User prompt */
  user: string;
  /** Модель — без префикса провайдера, маппится внутри */
  modelTier?: "premium" | "fast";
  /** Max output tokens */
  maxTokens?: number;
  /** Переопределить провайдера на этот вызов */
  provider?: AiProvider;
  /** Для бюджет-гарда */
  tenantId?: number;
  /** Для usage_events */
  callId?: number;
  /**
   * Переопределить модель для этого вызова (per-tenant настройка).
   * Формат: 'provider:model', например 'openai:gpt-4o-mini' или 'anthropic:claude-haiku-4-5'.
   * Если задан — используется вместо дефолта из ENV + modelTier.
   */
  modelOverride?: string;
}

export interface ToolCallResult<T> {
  result: T;
  rawResponseJson: string;
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Получить активного провайдера из ENV (default = openai). */
export function getActiveProvider(): AiProvider {
  const v = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (v === "anthropic") return "anthropic";
  return "openai";
}

/** Маппинг tier → конкретная модель у каждого провайдера. */
const MODEL_MAP: Record<AiProvider, { premium: string; fast: string }> = {
  openai: {
    premium: process.env.OPENAI_MODEL_PREMIUM?.trim() || "gpt-4o",
    fast:    process.env.OPENAI_MODEL_FAST?.trim()    || "gpt-4o-mini",
  },
  anthropic: {
    premium: process.env.ANTHROPIC_MODEL_PREMIUM?.trim() || "claude-sonnet-4-6",
    fast:    process.env.ANTHROPIC_MODEL_FAST?.trim()    || "claude-haiku-4-5",
  },
};

/**
 * Разбирает modelOverride вида 'provider:model' и возвращает { provider, model }.
 * Если modelOverride не задан или невалиден — возвращает null (используется дефолт).
 *
 * Поддерживаемые форматы:
 *   'openai:gpt-4o'
 *   'openai:gpt-4o-mini'
 *   'anthropic:claude-sonnet-4-6'
 *   'anthropic:claude-haiku-4-5'
 */
export function resolveModel(
  modelOverride: string | null | undefined,
  fallbackProvider: AiProvider,
  fallbackTier: "premium" | "fast"
): { provider: AiProvider; model: string } {
  if (modelOverride) {
    const colonIdx = modelOverride.indexOf(":");
    if (colonIdx > 0) {
      const providerStr = modelOverride.slice(0, colonIdx).trim().toLowerCase();
      const modelStr = modelOverride.slice(colonIdx + 1).trim();
      if ((providerStr === "openai" || providerStr === "anthropic") && modelStr) {
        return { provider: providerStr as AiProvider, model: modelStr };
      }
    }
    console.warn(`[ai-provider] невалидный modelOverride: '${modelOverride}', используем дефолт`);
  }
  return { provider: fallbackProvider, model: MODEL_MAP[fallbackProvider][fallbackTier] };
}

/**
 * Вызывает LLM с принудительным tool-use. Гарантирует что вернётся
 * структурированный JSON по schema (модель не может ответить «текстом мимо»).
 *
 * Retry: до 3 попыток для 429/529/overloaded с backoff 3s → 9s → 27s.
 * Budget: проверка ДО запроса (BudgetExceededError если лимит), запись расхода ПОСЛЕ.
 */
export async function callWithTool<T = unknown>(args: ToolCallArgs): Promise<ToolCallResult<T>> {
  const fallbackProvider = args.provider || getActiveProvider();
  const tier = args.modelTier || "premium";
  const { provider, model } = resolveModel(args.modelOverride, fallbackProvider, tier);

  // §4.4 Бюджет-гард — проверяем ДО запроса
  if (args.tenantId) {
    const kind = provider === "anthropic" ? "anthropic_tokens" : "openai_chat_tokens";
    await checkBudget(args.tenantId, kind);
  }

  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = provider === "anthropic"
        ? await callAnthropic<T>(args, model)
        : await callOpenAi<T>(args, model);

      // Запись расхода
      if (args.tenantId) {
        const kind = provider === "anthropic" ? "anthropic_tokens" : "openai_chat_tokens";
        await recordUsage(args.tenantId, kind, out.inputTokens + out.outputTokens, args.callId);
      }
      return out;
    } catch (e) {
      lastErr = e;
      const err = e as { status?: number; message?: string };
      const status = err.status ?? 0;
      const msg = err.message ?? "";
      const isRetryable =
        status === 429 || status === 529 ||
        /overloaded/i.test(msg) || /rate.?limit/i.test(msg);
      if (!isRetryable || attempt === maxAttempts) throw e;
      const baseDelay = 3000 * Math.pow(3, attempt - 1);
      const jitter = Math.floor(Math.random() * 1000);
      const delayMs = baseDelay + jitter;
      console.warn(`[ai-provider:${provider}] attempt ${attempt}/${maxAttempts} failed (${status} ${msg.slice(0, 80)}), retry in ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// ─── Anthropic implementation ─────────────────────────────

async function callAnthropic<T>(args: ToolCallArgs, model: string): Promise<ToolCallResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY не задан");
  const client = new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    timeout: 90_000,
  });

  const tool: Anthropic.Tool = {
    name: args.toolName,
    description: "Сохранить структурированный результат",
    input_schema: args.schema as Anthropic.Tool["input_schema"],
  };

  const msg = await client.messages.create({
    model,
    max_tokens: args.maxTokens ?? 4000,
    system: args.system,
    tools: [tool],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: args.user }],
  });

  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === args.toolName
  );
  if (!toolUse) {
    throw new Error(`Anthropic не вызвал tool ${args.toolName}`);
  }

  return {
    result: toolUse.input as T,
    rawResponseJson: JSON.stringify(toolUse.input),
    provider: "anthropic",
    model,
    inputTokens: msg.usage?.input_tokens ?? 0,
    outputTokens: msg.usage?.output_tokens ?? 0,
  };
}

// ─── OpenAI implementation ────────────────────────────────

async function callOpenAi<T>(args: ToolCallArgs, model: string): Promise<ToolCallResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY не задан");
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
    timeout: 90_000,
  });

  const completion = await client.chat.completions.create({
    model,
    max_tokens: args.maxTokens ?? 4000,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    tools: [{
      type: "function",
      function: {
        name: args.toolName,
        description: "Сохранить структурированный результат",
        parameters: args.schema,
      },
    }],
    tool_choice: { type: "function", function: { name: args.toolName } },
  });

  const choice = completion.choices[0];
  const toolCall = choice?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== args.toolName) {
    throw new Error(`OpenAI не вызвал tool ${args.toolName}`);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(toolCall.function.arguments) as T;
  } catch (e) {
    const finishReason = choice?.finish_reason;
    const hint = finishReason === "length"
      ? "Ответ обрезан по лимиту max_tokens — увеличьте maxTokens в callWithTool"
      : "Возможно модель вернула битый JSON — попробуйте retry";
    throw new Error(`OpenAI вернул невалидный JSON в tool ${args.toolName} (finish_reason=${finishReason}). ${hint}. Original error: ${(e as Error).message}`);
  }

  return {
    result: parsed,
    rawResponseJson: toolCall.function.arguments,
    provider: "openai",
    model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}
