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

  // Если принято — проверяем auto_approve и применяем в Bitrix ДО обновления статуса.
  // Bitrix должен подтвердить успех прежде чем мы помечаем расхождение как resolved.
  if (action === "accepted") {
    const tenant = await db
      .prepare(`SELECT discrepancy_action_mode FROM tenants WHERE id = ?`)
      .get<{ discrepancy_action_mode: string | null }>(me.tenantId);

    if (tenant?.discrepancy_action_mode === "auto_approve") {
      try {
        await applyDiscrepancyToBitrix(row);
      } catch (e) {
        // Bitrix недоступен или вернул ошибку — НЕ обновляем статус, сообщаем клиенту.
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[resolve] applyDiscrepancyToBitrix failed for #${discrepancyId}:`, msg);
        return NextResponse.json(
          { ok: false, error: `Не удалось записать в Bitrix: ${msg}` },
          { status: 502 }
        );
      }
    }
  }

  // Атомарный UPDATE: обновляем статус только если он всё ещё 'pending'.
  // Это исключает TOCTOU — два одновременных запроса не смогут оба выполнить UPDATE.
  const result = await db
    .prepare(
      `UPDATE card_discrepancies
         SET status = ?, resolved_at = datetime('now'), resolved_by_user_id = ?
       WHERE id = ? AND tenant_id = ? AND status = 'pending'`
    )
    .run(action, me.id, discrepancyId, me.tenantId);

  // changes === 0 означает что кто-то уже зарезолвил это расхождение
  if ((result as { changes?: number }).changes === 0) {
    return NextResponse.json({ ok: true, already_resolved: true });
  }

  return NextResponse.json({ ok: true });
}
