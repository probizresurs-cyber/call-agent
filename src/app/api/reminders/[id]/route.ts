/**
 * PATCH /api/reminders/:id { action: 'done' | 'snooze', hours?: number }
 * Меняет статус напоминания. Только владелец (по bitrixManagerId) может менять свои.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { markReminderDone, snoozeReminder } from "@/lib/reminders";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!id || isNaN(id)) return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });

  // Проверка владения — manager может менять только свои
  if (me.role === "manager") {
    const r = await getDbAsync()
      .prepare(`SELECT bitrix_manager_id, tenant_id FROM reminders_auto WHERE id = ?`)
      .get<{ bitrix_manager_id: string | null; tenant_id: number }>(id);
    if (!r || r.tenant_id !== me.tenantId) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    if (r.bitrix_manager_id !== me.bitrixManagerId) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: "done" | "snooze"; hours?: number };
  if (body.action === "done") {
    await markReminderDone(id, me.tenantId);
  } else if (body.action === "snooze") {
    await snoozeReminder(id, me.tenantId, Math.max(1, body.hours ?? 24));
  } else {
    return NextResponse.json({ ok: false, error: "action must be done|snooze" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
