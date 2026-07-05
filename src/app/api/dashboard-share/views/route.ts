/**
 * GET /api/dashboard-share/views — журнал просмотров публичного отчёта (для владельца).
 * Доступ: owner / admin / head (кто видит командный дашборд).
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getViewStats } from "@/lib/report-views";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canViewTeam(me.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const stats = await getViewStats(me.tenantId);
  return NextResponse.json({ ok: true, stats });
}
