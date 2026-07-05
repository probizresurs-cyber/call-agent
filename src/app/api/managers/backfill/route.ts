import { NextResponse } from "next/server";
import { getSessionUser, canManage } from "@/lib/auth";
import { backfillManagerNames } from "@/lib/managers";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const forceAll = url.searchParams.get("force") === "true";

  try {
    // Скоуп по тенанту вызывающего — не трогаем чужие тенанты.
    const result = await backfillManagerNames({ forceAll, tenantId: me.tenantId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
