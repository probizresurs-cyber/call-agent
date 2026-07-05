/**
 * GET — список всех скриптов (включая неактивные)
 * POST — создать новый скрипт
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canManage } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const db = getDbAsync();
  const rows = await db
    .prepare(
      `SELECT id, name, product, direction, content_md, checklist_json, key_phrases, is_active, updated_at
       FROM sales_scripts
       WHERE tenant_id = ?
       ORDER BY is_active DESC, COALESCE(product, '') ASC, name ASC`
    )
    .all(me.tenantId);
  return NextResponse.json({ ok: true, items: rows });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as {
    name?: string;
    product?: string | null;
    direction?: "in" | "out" | "all";
    content_md?: string;
    checklist?: Array<{ id: string; title: string; weight: number; description?: string }>;
    key_phrases?: string | null;
    is_active?: boolean;
  };
  if (!body.name) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }

  const db = getDbAsync();
  const result = await db.prepare(
    `INSERT INTO sales_scripts (tenant_id, name, product, direction, content_md, checklist_json, key_phrases, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    me.tenantId,
    body.name,
    body.product?.trim() || null,
    body.direction || "all",
    body.content_md || "",
    JSON.stringify(body.checklist ?? []),
    body.key_phrases?.trim() || null,
    body.is_active !== false
  );

  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
}
