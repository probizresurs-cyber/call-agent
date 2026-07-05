/**
 * GET — список всех менеджеров со статистикой, флагом видимости в отчётах,
 *       закреплённым продуктом и флагом переноса анализа в CRM.
 * PATCH — обновить is_active / excluded_from_reports / default_product / crm_sync_enabled.
 *
 * excluded_from_reports — sync-safe флаг «скрыть из отчётов» (директор и пр.).
 * В отличие от is_active он НЕ перезатирается синком менеджеров из Bitrix.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canManage } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { rlsFor } from "@/lib/rls";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = getDbAsync();

  // Tenant + (для manager) manager-скоуп по calls; join к managers тоже скоупим по тенанту.
  const rls = rlsFor(me, { table: "c" });

  const rows = await db.prepare(
    `SELECT
       c.manager_id AS id,
       COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name,
       MAX(m.email) AS email,
       COALESCE(MAX(CASE WHEN m.is_active THEN 1 ELSE 0 END), 1) AS is_active,
       COALESCE(MAX(CASE WHEN m.excluded_from_reports THEN 1 ELSE 0 END), 0) AS excluded_from_reports,
       MAX(m.default_product) AS default_product,
       COALESCE(MAX(CASE WHEN m.crm_sync_enabled THEN 1 ELSE 0 END), 0) AS crm_sync_enabled,
       COUNT(*) AS calls
     FROM calls c
     LEFT JOIN managers m ON m.id = c.manager_id AND m.tenant_id = c.tenant_id
     WHERE ${rls.sql} AND c.manager_id IS NOT NULL AND c.manager_id != ''
     GROUP BY c.manager_id
     ORDER BY calls DESC`
  ).all<{
    id: string; name: string; email: string | null;
    is_active: number; excluded_from_reports: number; default_product: string | null;
    crm_sync_enabled: number; calls: number;
  }>(...rls.params);

  return NextResponse.json({ ok: true, items: rows });
}

export async function PATCH(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as {
    id?: string;
    is_active?: boolean;
    excluded_from_reports?: boolean;
    default_product?: string | null;
    crm_sync_enabled?: boolean;
  };
  const { id } = body;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const db = getDbAsync();

  let validatedProduct: string | null | undefined;
  if ("default_product" in body) {
    const raw = (body.default_product ?? "").toString().trim();
    if (!raw) {
      validatedProduct = null;
    } else {
      const known = await db
        .prepare(`SELECT 1 AS ok FROM sales_scripts WHERE product = ? AND is_active = 1 AND tenant_id = ? LIMIT 1`)
        .get<{ ok: number }>(raw, me.tenantId);
      if (!known) {
        return NextResponse.json({ ok: false, error: `Неизвестный продукт: ${raw}` }, { status: 400 });
      }
      validatedProduct = raw;
    }
  }

  const current = await db
    .prepare(`SELECT is_active, excluded_from_reports, default_product, crm_sync_enabled FROM managers WHERE id = ? AND tenant_id = ?`)
    .get<{ is_active: number | boolean; excluded_from_reports: number | boolean; default_product: string | null; crm_sync_enabled: number | boolean }>(id, me.tenantId);

  const nextActive = "is_active" in body ? !!body.is_active : (current ? !!current.is_active : true);
  const nextExcluded = "excluded_from_reports" in body ? !!body.excluded_from_reports : (current ? !!current.excluded_from_reports : false);
  const nextProduct = validatedProduct !== undefined ? validatedProduct : (current?.default_product ?? null);
  const nextCrmSync = "crm_sync_enabled" in body ? !!body.crm_sync_enabled : (current ? !!current.crm_sync_enabled : false);

  // ON CONFLICT(id) DO UPDATE со скоупом по тенанту в WHERE — чужую строку
  // (тот же bitrix-id в другом тенанте) не перезатираем.
  await db.prepare(
    `INSERT INTO managers (id, tenant_id, is_active, excluded_from_reports, default_product, crm_sync_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       is_active = excluded.is_active,
       excluded_from_reports = excluded.excluded_from_reports,
       default_product = excluded.default_product,
       crm_sync_enabled = excluded.crm_sync_enabled,
       updated_at = datetime('now')
     WHERE managers.tenant_id = ?`
  ).run(id, me.tenantId, nextActive, nextExcluded, nextProduct, nextCrmSync, me.tenantId);

  return NextResponse.json({ ok: true });
}
