import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await requireUser();

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const status = searchParams.get("status");
  const sentiment = searchParams.get("sentiment");
  const q = searchParams.get("q");

  const where: string[] = [];
  const params: unknown[] = [];

  if (status) { where.push("c.status = ?"); params.push(status); }
  if (sentiment) { where.push("a.sentiment = ?"); params.push(sentiment); }
  if (q) {
    where.push(`c.id IN (SELECT call_id FROM transcripts_fts WHERE transcripts_fts MATCH ?)`);
    params.push(q);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*,
              a.summary, a.sentiment, a.manager_score, a.script_compliance,
              a.next_action, a.objections_json, a.topics_json
       FROM calls c
       LEFT JOIN analyses a ON a.call_id = c.id
       ${whereSql}
       ORDER BY c.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM calls c LEFT JOIN analyses a ON a.call_id = c.id ${whereSql}`)
    .get(...params) as { n: number };

  return NextResponse.json({ ok: true, items: rows, total: total.n });
}
