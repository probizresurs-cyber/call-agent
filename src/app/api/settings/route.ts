/**
 * GET — общие пользовательские настройки (пороги, параметры дашборда)
 * POST {key, value} — обновить
 *
 * ВНИМАНИЕ: таблица settings имеет PK = key (без tenant_id в ключе), поэтому
 * значения СЕЙЧАС глобальны на всю платформу (contact_threshold_seconds и пр.).
 * Настоящая per-tenant изоляция требует миграции БД (составной PK (tenant_id,key)
 * + скоуп в getSetting/setSetting). Пока — минимальная защита: запись только
 * для owner/admin, чтобы обычный пользователь/менеджер не менял глобальные настройки.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canManage } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";

export const runtime = "nodejs";

const KNOWN_KEYS = [
  "contact_threshold_seconds",
] as const;

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const out: Record<string, string | null> = {};
  for (const k of KNOWN_KEYS) out[k] = await getSetting(k);
  return NextResponse.json({ ok: true, settings: out });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const { key, value } = (await req.json()) as { key?: string; value?: string };
  if (!key || !(KNOWN_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 400 });
  }
  await setSetting(key, value || "");
  return NextResponse.json({ ok: true });
}
