/**
 * GET /api/tokens/status — статус токен-баланса текущего аккаунта (для баннера портала).
 * Доступ: owner/admin/head (видят биллинг). Менеджеру не отдаём.
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getBillingStatus } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canViewTeam(me.role)) return NextResponse.json({ ok: true, show: false });
  const s = await getBillingStatus(me.tenantId);
  return NextResponse.json({ ok: true, show: true, ...s });
}
