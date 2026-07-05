/**
 * POST /api/calls/:id/send-to-crm
 *
 * Запускает CRM-write для конкретного звонка (комментарии в Timeline всех связанных
 * сущностей + обновление DESCRIPTION в Activity).
 *
 * Поведение зависит от per-tenant DRY_RUN (см. /settings → Системные флаги):
 *   DRY=true:  формируется payload, пишется в crm_write_log с mode='dry', наружу ничего не уходит
 *   DRY=false: реальные API-вызовы в Bitrix24
 *
 * Возвращает массив WriteResult — UI рендерит превью / результат.
 *
 * Доступ: owner / admin / head (менеджер не может слать в CRM).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { sendCallToBitrix } from "@/lib/bitrix-write";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role === "manager") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const callId = parseInt(id, 10);
  if (!callId || isNaN(callId)) {
    return NextResponse.json({ ok: false, error: "bad call id" }, { status: 400 });
  }

  // Проверка владения ДО вызова общего sendCallToBitrix (его сигнатуру не меняем —
  // его же дёргает системный код по всем тенантам). owner/admin/head видят весь тенант.
  const owned = await getDbAsync()
    .prepare(`SELECT id FROM calls WHERE id = ? AND tenant_id = ?`)
    .get<{ id: number }>(callId, me.tenantId);
  if (!owned) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  try {
    const results = await sendCallToBitrix(callId);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = (e as Error).message;
    // Не раскрываем внутренние URL и токены
    const safeMsg = msg.includes('Invalid URL') || msg.includes('webhook')
      ? 'Internal configuration error'
      : msg;
    return NextResponse.json({ ok: false, error: safeMsg }, { status: 500 });
  }
}
