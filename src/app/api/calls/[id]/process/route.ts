import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { processCall } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g) return g;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  // ?script_product=МП|МК — принудительный выбор типа скрипта (обход AI-detect).
  // Передаётся из ReassignScriptButton когда руководитель корректирует тип вручную.
  const scriptProduct = req.nextUrl.searchParams.get("script_product") || undefined;

  try {
    await processCall(id, { scriptProductOverride: scriptProduct });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
