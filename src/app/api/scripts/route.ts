/**
 * GET — список всех скриптов (включая неактивные)
 * POST — создать новый скрипт
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const g = await guard(); if (g) return g;
  const db = getDb();
  const rows = db
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

  const db = getDb();
  const result = db.prepare(
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
