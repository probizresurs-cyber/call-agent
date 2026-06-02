import { NextRequest, NextResponse } from "next/server";
import { getDbAsync } from "@/lib/db-compat";
import { guard } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;
  const { name, content, checklist } = (await req.json()) as {
    name?: string;
    content?: string;
    checklist?: Array<{ id: string; title: string; weight: number; description?: string }>;
  };
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const db = getDbAsync();
  await db.prepare(`UPDATE sales_scripts SET is_active = 0`).run();
  await db.prepare(
    `INSERT INTO sales_scripts (name, content_md, checklist_json, is_active)
     VALUES (?, ?, ?, 1)`
  ).run(name, content || "", JSON.stringify(checklist ?? []));

  return NextResponse.json({ ok: true });
}
