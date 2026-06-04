/**
 * POST /api/discrepancies/:id/resolve
 *
 * Принять (accepted) или отклонить (rejected) расхождение.
 *
 * Права:
 *  - owner / admin / head — могут резолвить любое расхождение тенанта
 *  - manager — только своё (routed_to_user_id = me.id)
 *
 * Если action='accepted' и tenant.discrepancy_action_mode='auto_approve':
 *  вызываем applyDiscrepancyToBitrix() для записи нового значения в карточку CRM.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { applyDiscrepancyToBitrix } from "@/lib/discrepancy-detector";
import type { CardDiscrepancy } from "@/lib/discrepancy-types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const discrepancyId = parseInt(id, 10);
  if (!discrepancyId || isNaN(discrepancyId)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "accepted" && action !== "rejected") {
    return NextResponse.json(
      { ok: false, error: "action must be 'accepted' or 'rejected'" },
      { status: 400 }
    );
  }

  const db = getDbAsync();

  // Загружаем запись
  const row = await db
    .prepare(`SELECT * FROM card_discrepancies WHERE id = ? AND tenant_id = ?`)
    .get<CardDiscrepancy>(discrepancyId, me.tenantId);

  if (!row) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // Проверяем права доступа
  const isPrivileged = me.role === "owner" || me.role === "admin" || me.role === "head";
  if (!isPrivileged && row.routed_to_user_id !== me.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Если уже обработано — ничего не делаем
  if (row.status !== "pending") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Если принято — проверяем auto_approve
  if (action === "accepted") {
    const tenant = await db
      .prepare(`SELECT discrepancy_action_mode FROM tenants WHERE id = ?`)
      .get<{ discrepancy_action_mode: string | null }>(me.tenantId);

    if (tenant?.discrepancy_action_mode === "auto_approve") {
      try {
        await applyDiscrepancyToBitrix(row);
      } catch (e) {
        console.warn(`[resolve] applyDiscrepancyToBitrix failed for #${discrepancyId}:`, (e as Error).message);
        // Не прерываем — статус всё равно обновляем
      }
    }
  }

  // Обновляем статус
  await db
    .prepare(
      `UPDATE card_discrepancies
         SET status = ?, resolved_at = datetime('now'), resolved_by_user_id = ?
       WHERE id = ?`
    )
    .run(action, me.id, discrepancyId);

  return NextResponse.json({ ok: true });
}
