/**
 * GET /api/provider-health/check — вручную дёрнуть probe OpenAI и обновить статус
 * провайдера в settings. Полезно после пополнения баланса / замены ключа, чтобы
 * не ждать следующего звонка для гашения баннера.
 *
 * Только owner/admin: probe делает реальный (дешёвый, max_tokens:1) запрос к
 * провайдеру — не даём дёргать рядовым пользователям.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  probeOpenAiHealth,
  setProviderHealth,
  getProviderHealth,
} from "@/lib/provider-health";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner" && me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const probe = await probeOpenAiHealth();

  // Маппим результат probe в статус провайдера и сохраняем.
  const now = new Date().toISOString();
  if (probe.kind === "ok") {
    await setProviderHealth({
      status: "ok",
      provider: "openai",
      message: "Провайдер доступен",
      detected_at: now,
    });
  } else if (probe.kind === "quota") {
    await setProviderHealth({
      status: "quota",
      provider: "openai",
      message: "OpenAI: квота/биллинг исчерпан (429 insufficient_quota)",
      detected_at: now,
    });
  } else if (probe.kind === "auth") {
    await setProviderHealth({
      status: "auth",
      provider: "openai",
      message: "OpenAI: неверный или отозванный API-ключ (401)",
      detected_at: now,
    });
  }
  // kind="network" — не перетираем существующий статус: это транзиент, мог не
  // дойти probe сам. Возвращаем как есть, баннер не меняем.

  const health = await getProviderHealth();
  return NextResponse.json({ ok: true, probe, health });
}
