/**
 * GET — список всех менеджеров со статистикой, флагом видимости,
 *       закреплённым продуктом и флагом переноса анализа в CRM.
 * PATCH — обновить is_active / default_product / crm_sync_enabled для одного.
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

export async function GET() {
  const g = await guard(); if (g) return g;
  const db = getDbAsync();

  // Левый JOIN: менеджеры могут быть в calls но ещё не в managers (если backfill не запускался)
  const rows = await db.prepare(
    `SELECT
       c.manager_id AS id,
       COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name,
       MAX(m.email) AS email,
       COALESCE(MAX(CASE WHEN m.is_active THEN 1 ELSE 0 END), 1) AS is_active,
       MAX(m.default_product) AS default_product,
       COALESCE(MAX(CASE WHEN m.crm_sync_enabled THEN 1 ELSE 0 END), 0) AS crm_sync_enabled,
       COUNT(*) AS calls
     FROM calls c
     LEFT JOIN managers m ON m.id = c.manager_id
     WHERE c.manager_id IS NOT NULL AND c.manager_id != ''
     GROUP BY c.manager_id
     ORDER BY calls DESC`
  ).all<{
    id: string; name: string; email: string | null;
    is_active: number; default_product: string | null;
    crm_sync_enabled: number; calls: number;
  }>();

  return NextResponse.json({ ok: true, items: rows });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(); if (g) return g;
  const body = (await req.json()) as {
    id?: string;
    is_active?: boolean;
    default_product?: string | null;
    crm_sync_enabled?: boolean;
  };
  const { id } = body;
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const db = getDbAsync();

  // Валидация default_product: либо пусто/null (снять закрепление), либо один из
  // существующих product-кодов активных скриптов. Иначе игнорируем поле как ошибку ввода.
  let validatedProduct: string | null | undefined; // undefined = поле не передано, не трогаем
  if ("default_product" in body) {
    const raw = (body.default_product ?? "").toString().trim();
    if (!raw) {
      validatedProduct = null;
    } else {
      const known = await db
        .prepare(`SELECT 1 AS ok FROM sales_scripts WHERE product = ? AND is_active = 1 LIMIT 1`)
        .get<{ ok: number }>(raw);
      if (!known) {
        return NextResponse.json(
          { ok: false, error: `Неизвестный продукт: ${raw}` },
          { status: 400 }
        );
      }
      validatedProduct = raw;
    }
  }

  // Читаем текущее состояние, чтобы PATCH одного поля не затирал остальные при upsert.
  const current = await db
    .prepare(`SELECT is_active, default_product, crm_sync_enabled FROM managers WHERE id = ?`)
    .get<{ is_active: number | boolean; default_product: string | null; crm_sync_enabled: number | boolean }>(id);

  const nextActive = "is_active" in body ? !!body.is_active : (current ? !!current.is_active : true);
  const nextProduct = validatedProduct !== undefined ? validatedProduct : (current?.default_product ?? null);
  const nextCrmSync = "crm_sync_enabled" in body
    ? !!body.crm_sync_enabled
    : (current ? !!current.crm_sync_enabled : false);

  // Upsert: создаём запись если её не было
  await db.prepare(
    `INSERT INTO managers (id, is_active, default_product, crm_sync_enabled, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       is_active = excluded.is_active,
       default_product = excluded.default_product,
       crm_sync_enabled = excluded.crm_sync_enabled,
       updated_at = datetime('now')`
  ).run(id, nextActive, nextProduct, nextCrmSync);

  return NextResponse.json({ ok: true });
}
