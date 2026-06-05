/**
 * Admin API — промокоды Call-Agent.
 * Защищён Bearer CA_ADMIN_TOKEN (server-to-server из MarketRadar).
 *
 * GET  → { ok: true, promos: [...] }
 * POST → { ok: true, promo: {...} }   body: { code, description, discount_pct, bonus_calls, max_uses, expires_at }
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
    const promos = await db
      .prepare(`SELECT * FROM ca_promos ORDER BY created_at DESC`)
      .all();
    return NextResponse.json({ ok: true, promos });
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
    const { code, description, discount_pct, bonus_calls, max_uses, expires_at } = body as Record<string, string | number | null | undefined>;

    const err = (msg: string) => NextResponse.json({ ok: false, error: msg }, { status: 400 });
    const discount = Number(discount_pct ?? 0);
    const bonus = Number(bonus_calls ?? 0);
    const maxUses = max_uses != null ? Number(max_uses) : null;
    if (!code || String(code).length > 64) return err('code required, max 64 chars');
    if (description && String(description).length > 1000) return err('description max 1000 chars');
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return err('discount_pct 0..100');
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > 100_000) return err('bonus_calls 0..100_000');
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) return err('max_uses must be positive');

    const db = getDbAsync();
    const result = await db
      .prepare(
        `INSERT INTO ca_promos (code, description, discount_pct, bonus_calls, max_uses, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(code).trim(),
        description ? String(description).trim() : null,
        discount_pct != null ? Number(discount_pct) : 0,
        bonus_calls != null ? Number(bonus_calls) : 0,
        max_uses != null ? Number(max_uses) : null,
        expires_at ? String(expires_at) : null,
      );

    const promo = await db
      .prepare(`SELECT * FROM ca_promos WHERE id = ?`)
      .get(result.lastInsertRowid);

    return NextResponse.json({ ok: true, promo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("UNIQUE") ? 409 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
