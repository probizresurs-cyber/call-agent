/**
 * Детект перманентных ошибок провайдера (OpenAI): исчерпание квоты/биллинга,
 * отозванный ключ. Раньше при исчерпании квоты OpenAI обрывал соединение в
 * середине загрузки multipart-аудио → SDK видел только «Connection error.»
 * (APIConnectionError без HTTP-статуса). Эта ошибка попадала под retryable +
 * auto-retry каждые 30 мин → звонки бесконечно циклили pending→transcribing→
 * failed→pending, маскируясь под «В обработке».
 *
 * Решение: когда систематические обрывы исчерпали все ретраи транскрипции,
 * делаем ДЕШЁВЫЙ probe-запрос к /chat/completions с max_tokens:1 (маленькое
 * тело → ответ, в т.ч. 429, приходит целиком и не обрывается как multipart) и
 * по HTTP-статусу/телу понимаем: квота, auth или реальный транзиент. При квоте/
 * auth — помечаем звонок ЯВНОЙ НЕ-retryable ошибкой (ProviderQuotaError) и пишем
 * статус провайдера в settings, откуда дашборд рисует баннер.
 */
import { getSetting, setSetting } from "./db";

const PROVIDER_HEALTH_KEY = "provider_health";

/**
 * Перманентная (НЕ временная) ошибка провайдера. Воркер ловит её отдельно и
 * помечает звонок failed с явным текстом. Текст НАМЕРЕННО не содержит подстрок
 * из RETRYABLE_ERROR_PATTERNS воркера (нет "Connection error"/"429"/"403"/
 * "ETIMEDOUT"...), чтобы auto-retry не гонял такой звонок по кругу.
 */
export class ProviderQuotaError extends Error {
  /** Какой провайдер (пока только "openai"). */
  provider: string;
  /** Человекочитаемая причина: "quota" | "auth" | произвольный текст. */
  reason: string;

  constructor(message: string, provider: string, reason: string) {
    super(message);
    this.name = "ProviderQuotaError";
    this.provider = provider;
    this.reason = reason;
  }
}

/** Результат probe-запроса к OpenAI. */
export interface ProbeResult {
  ok: boolean;
  kind: "ok" | "quota" | "auth" | "network";
  httpStatus?: number;
  message?: string;
}

/**
 * Дешёвый probe к OpenAI: POST {OPENAI_BASE_URL}/chat/completions с телом
 * {model, messages:[{role:"user",content:"ping"}], max_tokens:1}. Маленькое
 * тело — ответ (включая 429 insufficient_quota) приходит целиком, не обрывается
 * как multipart-загрузка аудио. Используем fetch напрямую (не SDK), чтобы видеть
 * сырой HTTP-статус и тело без «Connection error.»-обёртки SDK.
 */
export async function probeOpenAiHealth(): Promise<ProbeResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, kind: "auth", message: "OPENAI_API_KEY не задан" };
  }

  // OPENAI_BASE_URL — прокси (Cloudflare Worker) для обхода гео-блока РФ.
  // Дефолт — официальный апстрим. Нормализуем хвостовой слэш.
  const baseURL = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL_PROBE?.trim() || "gpt-4o-mini";

  // Таймаут 20 сек — probe должен быть быстрым, не блокировать очередь надолго.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    const text = await res.text().catch(() => "");

    if (res.status === 200) {
      return { ok: true, kind: "ok", httpStatus: 200 };
    }

    const lower = text.toLowerCase();
    if (
      res.status === 429 &&
      (lower.includes("insufficient_quota") || lower.includes("exceeded your current quota"))
    ) {
      return { ok: false, kind: "quota", httpStatus: 429, message: text.slice(0, 300) };
    }
    if (res.status === 401) {
      return { ok: false, kind: "auth", httpStatus: 401, message: text.slice(0, 300) };
    }
    // Прочие коды (429 rate-limit без insufficient_quota, 403 гео-блок, 5xx) —
    // трактуем как сетевой/транзиент: НЕ маскируем под квоту, реальный звонок
    // переретраится воркером как раньше.
    return { ok: false, kind: "network", httpStatus: res.status, message: text.slice(0, 300) };
  } catch (e) {
    // timeout / DNS / отказ соединения — сетевая проблема (транзиент).
    return { ok: false, kind: "network", message: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────── Статус провайдера в settings (для баннера) ───────────────

export interface ProviderHealth {
  status: "ok" | "quota" | "auth" | "network";
  provider: string;
  message: string;
  detected_at: string; // ISO 8601
}

/** Сохранить статус провайдера (JSON в settings["provider_health"]). */
export async function setProviderHealth(h: ProviderHealth): Promise<void> {
  await setSetting(PROVIDER_HEALTH_KEY, JSON.stringify(h));
}

/** Прочитать статус провайдера. null — если ещё ни разу не записывали. */
export async function getProviderHealth(): Promise<ProviderHealth | null> {
  const raw = await getSetting(PROVIDER_HEALTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProviderHealth;
  } catch {
    return null;
  }
}

/**
 * Если текущий статус провайдера деградировавший (!= "ok") — сбросить в "ok".
 * Вызывается при первой успешной транскрипции, чтобы баннер сам погас, когда
 * провайдер снова заработал (пополнили баланс / заменили ключ).
 */
export async function clearProviderHealthIfDegraded(): Promise<void> {
  const current = await getProviderHealth();
  if (current && current.status !== "ok") {
    await setProviderHealth({
      status: "ok",
      provider: current.provider,
      message: "Провайдер снова доступен",
      detected_at: new Date().toISOString(),
    });
  }
}
