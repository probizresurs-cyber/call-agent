/**
 * POST /api/bitrix-activities — ручной триггер забора email и Open Lines чатов из Bitrix.
 *
 * Body (опционально):
 *   { since?: "2026-01-01T00:00:00", limit?: 500 }
 *
 * Если since не передан — берётся из tenants.settings.bitrix_activities_last_fetched
 * (инкрементально, не дублируем).
 *
 * Доступ: owner / admin / head.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchEmailAndChats, getLastFetchedAt } from "@/lib/bitrix-activities";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role === "manager") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  if (!process.env.BITRIX_WEBHOOK_URL?.trim()) {
    return NextResponse.json({ ok: false, error: "BITRIX_WEBHOOK_URL не задан" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    since?: string;
    limit?: number;
    fullHistory?: boolean;
  };
  // fullHistory=true → игнорируем last_fetched, тянем всё
  const since = body.fullHistory
    ? null
    : (body.since || (await getLastFetchedAt()) || null);

  try {
    const result = await fetchEmailAndChats({
      tenantId: me.tenantId,
      since,
      limit: body.limit ?? 500,
    });
    return NextResponse.json({ ok: true, result, since });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const lastFetched = await getLastFetchedAt();
  return NextResponse.json({ ok: true, lastFetched });
}
