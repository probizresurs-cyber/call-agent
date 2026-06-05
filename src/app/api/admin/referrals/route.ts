/**
 * Admin API — реф-ссылки Call-Agent.
 * Защищён Bearer CA_ADMIN_TOKEN (server-to-server из MarketRadar).
 *
 * GET  → { ok: true, referrals: [...] }
 * POST → { ok: true, referral: {...} }   body: { code, name, discount_pct, max_uses, expires_at }
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
    const referrals = await db
      .prepare(`SELECT * FROM ca_referrals ORDER BY created_at DESC`)
      .all();
    return NextResponse.json({ ok: true, referrals });
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
    const { code, name, discount_pct, max_uses, expires_at } = body as Record<string, string | number | null | undefined>;

    if (!code || String(code).trim() === "") {
      return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 });
    }

    const db = getDbAsync();
    const result = await db
      .prepare(
        `INSERT INTO ca_referrals (code, name, discount_pct, max_uses, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        String(code).trim(),
        name ? String(name).trim() : null,
        discount_pct != null ? Number(discount_pct) : 0,
        max_uses != null ? Number(max_uses) : null,
        expires_at ? String(expires_at) : null,
      );

    const referral = await db
      .prepare(`SELECT * FROM ca_referrals WHERE id = ?`)
      .get(result.lastInsertRowid);

    return NextResponse.json({ ok: true, referral });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("UNIQUE") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
