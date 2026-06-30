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
  // ВАЖНО: за nginx-прокси request.url = внутренний http://localhost:3030/...
  // Если редиректить от него — браузер уйдёт на localhost:3030 (ERR_CONNECTION_REFUSED).
  // Поэтому берём ПУБЛИЧНЫЙ хост из NEXT_PUBLIC_BASE_URL (как в ShareDashboardButton).
  const base = (process.env.NEXT_PUBLIC_BASE_URL || "https://marketradar24.ru").replace(/\/+$/, "");
  const dest = ok ? `${base}/call-agent/dashboard?period=all` : `${base}/call-agent/login`;
  return NextResponse.redirect(dest);
}
