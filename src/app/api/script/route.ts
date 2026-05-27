import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await requireUser();
  const { name, content, checklist } = (await req.json()) as {
    name?: string;
    content?: string;
    checklist?: Array<{ id: string; title: string; weight: number; description?: string }>;
  };
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const db = getDb();
  db.prepare(`UPDATE sales_scripts SET is_active = 0`).run();
  db.prepare(
    `INSERT INTO sales_scripts (name, content_md, checklist_json, is_active)
     VALUES (?, ?, ?, 1)`
  ).run(name, content || "", JSON.stringify(checklist ?? []));

  return NextResponse.json({ ok: true });
}
