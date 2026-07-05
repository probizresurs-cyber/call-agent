import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { rlsFor } from "@/lib/rls";
import { processCall } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  // Проверка владения ДО вызова общего processCall (у processCall сигнатуру не меняем —
  // его же дёргает системный воркер по всем тенантам).
  const rls = rlsFor(me, { table: "calls" });
  const owned = await getDbAsync()
    .prepare(`SELECT id FROM calls WHERE id = ? AND ${rls.sql}`)
    .get<{ id: number }>(id, ...rls.params);
  if (!owned) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
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
