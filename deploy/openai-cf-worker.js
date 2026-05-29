/**
 * Cloudflare Worker — обратный прокси для OpenAI API.
 * Обходит гео-блокировку OpenAI для VPS в РФ.
 *
 * УСТАНОВКА:
 * 1. https://dash.cloudflare.com → Workers & Pages → Create application → Create Worker
 * 2. Дать имя (например `openai-proxy`)
 * 3. Удалить шаблонный код, вставить ЭТОТ файл целиком
 * 4. Save and Deploy
 * 5. Скопировать выданный URL вида `https://openai-proxy.<твой-аккаунт>.workers.dev`
 * 6. В call-agent .env:  OPENAI_BASE_URL=https://openai-proxy.<...>.workers.dev/v1
 *
 * БЕЗОПАСНОСТЬ:
 * Worker прозрачно пробрасывает Authorization header — без него ничего не пройдёт.
 * Этот код не логирует ни тела запросов, ни ключи. Тариф Free CF: 100k запросов/день.
 */

export default {
  async fetch(request, env, ctx) {
    const incoming = new URL(request.url);

    // Все запросы проксируем на api.openai.com с сохранением path/query
    const target = new URL("https://api.openai.com" + incoming.pathname + incoming.search);

    // Whisper-эндпоинт принимает multipart/form-data — стримим body как есть
    const init = {
      method: request.method,
      headers: stripHopByHop(request.headers),
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    };

    // Хост в Host-заголовке обязателен для TLS handshake
    init.headers.set("Host", "api.openai.com");

    try {
      const upstream = await fetch(target.toString(), init);
      // Возвращаем как есть
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "proxy_error", message: String(e) }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};

/** Убираем заголовки которые нельзя пробрасывать (RFC 7230) */
function stripHopByHop(headers) {
  const out = new Headers(headers);
  for (const h of [
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade",
    "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
    "x-real-ip", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto",
  ]) {
    out.delete(h);
  }
  return out;
}
