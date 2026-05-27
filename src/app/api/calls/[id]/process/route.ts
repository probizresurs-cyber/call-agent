import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { processCall } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g) return g;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  try {
    await processCall(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
