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
  return NextResponse.json({
    ok: true,
    enabled: isAutoImportEnabled(),
    last: getLastAutoImport(),
  });
}

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; runNow?: boolean };

  if (typeof body.enabled === "boolean") {
    setAutoImportEnabled(body.enabled);
  }
  let runResult = null;
  if (body.runNow) {
    runResult = await runAutoImport();
  }
  return NextResponse.json({
    ok: true,
    enabled: isAutoImportEnabled(),
    last: getLastAutoImport(),
    runResult,
  });
}
