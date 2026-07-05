/**
 * POST /api/objections/recluster — пересчитать семантические категории возражений
 * через AI (платный вызов). Доступ: owner/admin/head (canViewTeam).
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { computeClusterMap } from "@/lib/objection-clusters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canViewTeam(me.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const res = await computeClusterMap(me.tenantId);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
