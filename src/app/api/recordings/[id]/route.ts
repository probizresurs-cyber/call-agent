/**
 * Отдаёт mp3-запись звонка (для плеера в UI).
 * Достаём из БД recording_path и стримим.
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDbAsync } from "@/lib/db-compat";
import { guard } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g) return g;
  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return new Response("bad id", { status: 400 });

  const row = await getDbAsync()
    .prepare(`SELECT recording_path FROM calls WHERE id = ?`)
    .get<{ recording_path: string | null }>(id);

  if (!row?.recording_path || !fs.existsSync(row.recording_path)) {
    return new Response("recording not found", { status: 404 });
  }

  const ext = path.extname(row.recording_path).toLowerCase();
  const mime =
    ext === ".mp3" ? "audio/mpeg" :
    ext === ".wav" ? "audio/wav" :
    ext === ".ogg" ? "audio/ogg" :
    ext === ".m4a" ? "audio/mp4" :
    "application/octet-stream";

  const stream = fs.createReadStream(row.recording_path);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
