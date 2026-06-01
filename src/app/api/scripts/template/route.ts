/**
 * POST /api/scripts/template?key=mp
 * Создаёт скрипт из готового шаблона.
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { TEMPLATES, type TemplateKey } from "@/lib/script-templates";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;

  const url = new URL(req.url);
  const key = url.searchParams.get("key") as TemplateKey | null;
  if (!key || !(key in TEMPLATES)) {
    return NextResponse.json({ ok: false, error: "unknown template key" }, { status: 400 });
  }
  const t = TEMPLATES[key];
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO sales_scripts (name, product, direction, content_md, checklist_json, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(t.name, t.code, t.direction, t.content_md, JSON.stringify(t.checklist));

  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
}
