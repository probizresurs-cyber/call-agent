/**
 * POST /api/scripts/upload-docx
 * multipart/form-data: file=<docx>
 * Returns: { ok, text } — извлечённый текст скрипта
 */
import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { guard } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const g = await guard(); if (g) return g;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
  }
  if (file.size > 5_000_000) {
    return NextResponse.json({ ok: false, error: "файл слишком большой (>5MB)" }, { status: 413 });
  }
  if (!/\.docx$/i.test(file.name)) {
    return NextResponse.json({ ok: false, error: "только .docx" }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    return NextResponse.json({ ok: true, text, fileName: file.name });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
