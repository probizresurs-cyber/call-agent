/**
 * GET — статус автоимпорта (включён / последний запуск / результат)
 * POST { enabled: boolean } — переключить
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import {
  isAutoImportEnabled,
  setAutoImportEnabled,
  getLastAutoImport,
  runAutoImport,
} from "@/lib/auto-importer";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const g = await guard(); if (g) return g;
  const [enabled, last] = await Promise.all([isAutoImportEnabled(), getLastAutoImport()]);
  return NextResponse.json({ ok: true, enabled, last });
}

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; runNow?: boolean };

  if (typeof body.enabled === "boolean") {
    await setAutoImportEnabled(body.enabled);
  }
  let runResult = null;
  if (body.runNow) {
    // Ручной запуск из UI всегда тянет последние 24 часа,
    // не зависит от того когда был предыдущий цикл
    runResult = await runAutoImport({ manual: true });
  }
  const [enabled, last] = await Promise.all([isAutoImportEnabled(), getLastAutoImport()]);
  return NextResponse.json({ ok: true, enabled, last, runResult });
}
