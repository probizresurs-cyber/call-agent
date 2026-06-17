import { redirect } from "next/navigation";
import { loginDemo } from "@/lib/auth";

/**
 * Публичный вход в демо-режим — БЕЗ пароля.
 * URL: /call-agent/demo (страница вне группы (app), как /login и /pricing).
 *
 * Server component: создаёт сессию для demo-пользователя (login=test, role=demo)
 * через loginDemo() — она же ставит cookie ca_session и ca_demo=1 (включает
 * read-only защиту в middleware) — затем редиректит на дашборд.
 *
 * Идемпотентно: при каждом заходе создаётся новая сессия (старые истекают сами).
 * Если demo-пользователь не засеян (seed-demo.ts не запускался) — уводим на /login.
 *
 * dynamic — иначе Next попытается отрендерить страницу статически на билде,
 * а нам нужны cookies()/БД на каждый запрос.
 */
export const dynamic = "force-dynamic";

export default async function DemoEntryPage() {
  const ok = await loginDemo();
  if (!ok) {
    // Демо-аккаунт ещё не создан в БД — отправляем на обычный логин.
    redirect("/login");
  }
  redirect("/dashboard");
}
