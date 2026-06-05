/**
 * Admin API — партнёры Call-Agent.
 * Защищён Bearer CA_ADMIN_TOKEN (shared-secret для server-to-server вызовов из MR).
 *
 * GET  → { ok: true, partners: [...] }
 * POST { name, email, contact, commission_pct, ref_code, notes } → INSERT
 */
import { NextRequest, NextResponse } from "next/server";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.CA_ADMIN_TOKEN;
  if (!expected || expected.length < 16) {
    return { ok: false, status: 500, error: "CA_ADMIN_TOKEN is not configured on server" };
  }
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, error: "Missing Bearer token" };
  if (m[1].trim() !== expected) return { ok: false, status: 403, error: "Invalid token" };
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const db = getDbAsync();
    const rows = await db
      .prepare(`SELECT * FROM ca_partners ORDER BY created_at DESC`)
      .all();

    return NextResponse.json({ ok: true, partners: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await req.json().catch(() => ({}));
    const { name, email, contact, commission_pct, ref_code, notes } = body as {
      name?: string;
      email?: string;
      contact?: string;
      commission_pct?: number;
      ref_code?: string;
      notes?: string;
    };

    if (!name || !String(name).trim()) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }

    const db = getDbAsync();
    const result = await db
      .prepare(
        `INSERT INTO ca_partners (name, email, contact, commission_pct, ref_code, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(name).trim(),
        email ? String(email).trim() : null,
        contact ? String(contact).trim() : null,
        commission_pct != null ? Number(commission_pct) : 10,
        ref_code ? String(ref_code).trim() : null,
        notes ? String(notes).trim() : null
      );

    return NextResponse.json({ ok: true, id: result.lastInsertRowid }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
