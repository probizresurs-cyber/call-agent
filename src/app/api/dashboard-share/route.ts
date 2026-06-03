/**
 * GET    /api/dashboard-share — текущий токен (если есть)
 * POST   /api/dashboard-share — сгенерировать (или перегенерировать) токен
 * DELETE /api/dashboard-share — отозвать
 *
 * Доступ: owner / admin.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDashboardToken, regenerateDashboardToken, revokeDashboardToken } from "@/lib/dashboard-share";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const token = await getDashboardToken(me.tenantId);
  return NextResponse.json({ ok: true, token });
}

export async function POST() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner" && me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const token = await regenerateDashboardToken(me.tenantId);
  return NextResponse.json({ ok: true, token });
}

export async function DELETE() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner" && me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  await revokeDashboardToken(me.tenantId);
  return NextResponse.json({ ok: true });
}
