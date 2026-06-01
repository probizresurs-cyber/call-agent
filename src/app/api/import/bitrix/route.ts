/**
 * Импорт исторических звонков из Битрикс24 в нашу БД.
 * После INSERT воркер сам подхватит звонки в `pending` и обработает.
 *
 * POST /api/import/bitrix
 * Body: { fromDate: "YYYY-MM-DD", toDate?: "YYYY-MM-DD", managerIds?: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { importCallsFromBitrix } from "@/lib/importer";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;

  const body = (await req.json().catch(() => ({}))) as {
    fromDate?: string;
    toDate?: string;
    managerIds?: string[];
    includeServiceCalls?: boolean;
  };

  if (!body.fromDate) {
    return NextResponse.json(
      { ok: false, error: "fromDate обязателен (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const result = await importCallsFromBitrix({
    fromDate: body.fromDate,
    toDate: body.toDate,
    managerIds: body.managerIds,
    includeServiceCalls: body.includeServiceCalls,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
