import { NextResponse, type NextRequest } from "next/server";

/**
 * Read-only защита демо-режима — ОДНА точка контроля для всех API-роутов.
 *
 * Демо-режим помечается cookie `ca_demo=1` (ставится при входе в /demo или
 * при логине demo-пользователя). Если эта cookie есть и пришёл мутирующий
 * запрос (НЕ GET/HEAD) к любому /api/ — отдаём 403 и НЕ пропускаем дальше.
 *
 * Так нам не нужно патчить каждый из ~20 API-роутов: достаточно перехватить
 * мутацию здесь. UI-кнопки дизейблятся отдельно (defense-in-depth), но даже
 * если клиент обойдёт UI — сервер изменение не выполнит.
 *
 * Исключение: /api/auth/logout — выход из демо должен работать (это POST,
 * но он не меняет демо-данные, а лишь убивает сессию).
 *
 * basePath: в Next.js middleware request.nextUrl.pathname приходит БЕЗ
 * basePath (`/api/...`), но nginx/прокси могут прислать и `/call-agent/api/...`.
 * Проверка через includes("/api/") покрывает оба варианта.
 */
export function middleware(request: NextRequest) {
  const isDemo = request.cookies.get("ca_demo")?.value === "1";
  if (!isDemo) return NextResponse.next();

  const method = request.method.toUpperCase();
  const isMutating = method !== "GET" && method !== "HEAD";
  if (!isMutating) return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const isApi = pathname.includes("/api/");
  if (!isApi) return NextResponse.next();

  // Выход из демо-сессии разрешаем всегда.
  if (pathname.endsWith("/api/auth/logout")) return NextResponse.next();

  return NextResponse.json(
    { ok: false, error: "Демо-режим: только просмотр. Изменения недоступны." },
    { status: 403 }
  );
}

// Матчер широкий — реальная фильтрация делается внутри функции по
// cookie + методу + pathname.includes("/api/"). Статику исключаем.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon).*)"],
};
