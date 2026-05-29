import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { backfillManagerNames } from "@/lib/managers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const g = await guard(); if (g) return g;

  const url = new URL(req.url);
  const forceAll = url.searchParams.get("force") === "true";

  try {
    const result = await backfillManagerNames({ forceAll });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
