/**
 * GET — список всех менеджеров со статистикой и флагом видимости.
 * PATCH — обновить is_active для одного.
 */
import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const g = await guard(); if (g) return g;
  const db = getDb();

  // Левый JOIN: менеджеры могут быть в calls но ещё не в managers (если backfill не запускался)
  const rows = db.prepare(
    `SELECT
       c.manager_id AS id,
       COALESCE(MAX(c.manager_name), m.name, '') AS name,
       m.email,
       COALESCE(m.is_active, 1) AS is_active,
       COUNT(*) AS calls
     FROM calls c
     LEFT JOIN managers m ON m.id = c.manager_id
     WHERE c.manager_id IS NOT NULL AND c.manager_id != ''
     GROUP BY c.manager_id
     ORDER BY calls DESC`
  ).all() as Array<{
    id: string; name: string; email: string | null;
    is_active: number; calls: number;
  }>;

  return NextResponse.json({ ok: true, items: rows });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(); if (g) return g;
  const { id, is_active } = (await req.json()) as { id?: string; is_active?: boolean };
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const db = getDb();
  // Upsert: создаём запись если её не было
  db.prepare(
    `INSERT INTO managers (id, is_active, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       is_active = excluded.is_active,
       updated_at = datetime('now')`
  ).run(id, is_active ? 1 : 0);

  return NextResponse.json({ ok: true });
}
