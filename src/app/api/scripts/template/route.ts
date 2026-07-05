/**
 * POST /api/scripts/template?key=mp
 * Создаёт скрипт из готового шаблона.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canManage } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { TEMPLATES, type TemplateKey } from "@/lib/script-templates";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key") as TemplateKey | null;
  if (!key || !(key in TEMPLATES)) {
    return NextResponse.json({ ok: false, error: "unknown template key" }, { status: 400 });
  }
  const t = TEMPLATES[key];
  const db = getDbAsync();
  const result = await db.prepare(
    `INSERT INTO sales_scripts (tenant_id, name, product, direction, content_md, checklist_json, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(me.tenantId, t.name, t.code, t.direction, t.content_md, JSON.stringify(t.checklist), true);

  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
}
