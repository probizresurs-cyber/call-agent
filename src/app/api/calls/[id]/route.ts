import { NextRequest, NextResponse } from "next/server";
import { getDbAsync } from "@/lib/db-compat";
import { guard } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g) return g;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  const db = getDbAsync();
  const call = await db.prepare(`SELECT * FROM calls WHERE id = ?`).get(id);
  if (!call) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const transcript = await db.prepare(`SELECT * FROM transcripts WHERE call_id = ?`).get(id);
  const analysis = await db.prepare(`SELECT * FROM analyses WHERE call_id = ?`).get(id);

  return NextResponse.json({ ok: true, call, transcript, analysis });
}
