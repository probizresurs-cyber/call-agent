import { NextResponse, type NextRequest } from "next/server";
import { loginDemo } from "@/lib/auth";

/**
 * Публичный вход в демо-режим — БЕЗ пароля.
 * URL: /call-agent/demo
 *
 * ВАЖНО: это Route Handler (route.ts), а НЕ server-component страница.
 * loginDemo() создаёт сессию через cookies().set(), а устанавливать cookie
 * можно только в Route Handler / Server Action — НЕ во время рендера
 * server-component (там cookies() read-only → ошибка 500). Поэтому вход в
 * демо живёт здесь.
 *
 * Логика: ставим demo-сессию (+ cookie ca_demo=1 для read-only middleware),
 * затем редиректим на дашборд. Если demo-юзер не засеян (seed-demo.ts не
 * запускался) — уводим на обычный /login.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let ok = false;
  try {
    ok = await loginDemo();
  } catch (e) {
    console.error("[demo] loginDemo failed:", (e as Error).message);
  }
  // basePath /call-agent включаем в путь явно (NextResponse.redirect требует
  // абсолютный URL; new URL подставит хост из request.url).
  const dest = ok ? "/call-agent/dashboard" : "/call-agent/login";
  return NextResponse.redirect(new URL(dest, request.url));
}
