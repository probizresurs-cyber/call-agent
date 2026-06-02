/**
 * GET — список всех скриптов (включая неактивные)
 * POST — создать новый скрипт
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

export async function GET() {
  const g = await guard(); if (g) return g;
  const db = getDbAsync();
  const rows = await db
    .prepare(
      `SELECT id, name, product, direction, content_md, checklist_json, is_active, updated_at
       FROM sales_scripts
       ORDER BY is_active DESC, COALESCE(product, '') ASC, name ASC`
    )
    .all();
  return NextResponse.json({ ok: true, items: rows });
}

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;
  const body = (await req.json()) as {
    name?: string;
    product?: string | null;
    direction?: "in" | "out" | "all";
    content_md?: string;
    checklist?: Array<{ id: string; title: string; weight: number; description?: string }>;
    is_active?: boolean;
  };
  if (!body.name) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }

  const db = getDbAsync();
  const result = await db.prepare(
    `INSERT INTO sales_scripts (name, product, direction, content_md, checklist_json, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    body.name,
    body.product?.trim() || null,
    body.direction || "all",
    body.content_md || "",
    JSON.stringify(body.checklist ?? []),
    body.is_active === false ? 0 : 1
  );

  return NextResponse.json({ ok: true, id: result.lastInsertRowid });
}
