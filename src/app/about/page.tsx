/**
 * /about упразднён как отдельный маршрут — лендинг переехал на корень
 * /call-agent. Оставлен редиректом ради старых ссылок (например, уже
 * разошедшихся в Telegram) — не отдаём 404 по ним.
 */
import { redirect } from "next/navigation";

export default function AboutRedirect() {
  redirect("/");
}
