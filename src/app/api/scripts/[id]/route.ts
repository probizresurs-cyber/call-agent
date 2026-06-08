/**
 * PATCH — обновить скрипт
 * DELETE — удалить
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g) return g;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
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

  const db = getDbAsync();
  const fields: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { fields.push("name = ?"); params.push(body.name); }
  if (body.product !== undefined) { fields.push("product = ?"); params.push(body.product?.trim() || null); }
  if (body.direction !== undefined) { fields.push("direction = ?"); params.push(body.direction); }
  if (body.content_md !== undefined) { fields.push("content_md = ?"); params.push(body.content_md); }
  if (body.checklist !== undefined) { fields.push("checklist_json = ?"); params.push(JSON.stringify(body.checklist)); }
  if (body.key_phrases !== undefined) { fields.push("key_phrases = ?"); params.push((body.key_phrases ?? "").trim() || null); }
  if (body.is_active !== undefined) { fields.push("is_active = ?"); params.push(!!body.is_active); }
  fields.push("updated_at = datetime('now')");

  if (fields.length === 1) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }

  params.push(id);
  await db.prepare(`UPDATE sales_scripts SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g) return g;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  await getDbAsync().prepare(`DELETE FROM sales_scripts WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
