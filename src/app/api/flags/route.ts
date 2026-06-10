/**
 * GET  /api/flags — текущие значения системных флагов для тенанта пользователя.
 * POST /api/flags { dry_run: boolean } — переключить per-tenant DRY_RUN.
 *
 * Только для роли owner/admin (head/manager не должны менять системные настройки).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getFlagsSummary, setDryRunForTenant, type DryRunKind } from "@/lib/flags";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const summary = await getFlagsSummary(me.tenantId);
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner" && me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  // Body: { dry_run: boolean, kind?: "crm" | "messages" }
  // Без kind — пишет legacy общий ключ (старый UI). С kind — переключает только этот класс.
  const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean; kind?: string };
  if (typeof body.dry_run !== "boolean") {
    return NextResponse.json({ ok: false, error: "dry_run boolean required" }, { status: 400 });
  }
  const kind: DryRunKind | undefined =
    body.kind === "crm" || body.kind === "messages" ? body.kind : undefined;
  await setDryRunForTenant(me.tenantId, body.dry_run, kind);
  const summary = await getFlagsSummary(me.tenantId);
  return NextResponse.json({ ok: true, ...summary });
}
