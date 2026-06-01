/**
 * GET — общие пользовательские настройки (пороги, параметры дашборда)
 * POST {key, value} — обновить
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";

export const runtime = "nodejs";

const KNOWN_KEYS = [
  "contact_threshold_seconds",
] as const;

export async function GET() {
  const g = await guard(); if (g) return g;
  const out: Record<string, string | null> = {};
  for (const k of KNOWN_KEYS) out[k] = getSetting(k);
  return NextResponse.json({ ok: true, settings: out });
}

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;
  const { key, value } = (await req.json()) as { key?: string; value?: string };
  if (!key || !(KNOWN_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ ok: false, error: "unknown key" }, { status: 400 });
  }
  setSetting(key, value || "");
  return NextResponse.json({ ok: true });
}
