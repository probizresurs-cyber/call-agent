import { NextRequest, NextResponse } from "next/server";
import { getDbAsync } from "@/lib/db-compat";
import { getSessionUser, canManage } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const { name, content, checklist } = (await req.json()) as {
    name?: string;
    content?: string;
    checklist?: Array<{ id: string; title: string; weight: number; description?: string }>;
  };
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const db = getDbAsync();
  // Гасим активные скрипты ТОЛЬКО своего тенанта (раньше WHERE отсутствовал —
  // деактивировались скрипты всех тенантов сразу).
  await db.prepare(`UPDATE sales_scripts SET is_active = ? WHERE tenant_id = ?`).run(false, me.tenantId);
  await db.prepare(
    `INSERT INTO sales_scripts (tenant_id, name, content_md, checklist_json, is_active)
     VALUES (?, ?, ?, ?, ?)`
  ).run(me.tenantId, name, content || "", JSON.stringify(checklist ?? []), true);

  return NextResponse.json({ ok: true });
}
