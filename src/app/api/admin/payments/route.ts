/**
 * Admin API — платежи Call-Agent.
 * Защищён Bearer CA_ADMIN_TOKEN (shared-secret для server-to-server вызовов из MR).
 *
 * GET  → { ok: true, payments: [...] }
 * POST { tenant_id, amount, plan, status, payment_method, period_from, period_to, notes } → INSERT
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
    const { searchParams } = new URL(req.url);
    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10) || 0);
    const offset = page * 200;

    const db = getDbAsync();
    const payments = await db
      .prepare(
        `SELECT p.*, t.name AS tenant_name_resolved
         FROM ca_payments p
         LEFT JOIN tenants t ON t.id = p.tenant_id
         ORDER BY p.created_at DESC LIMIT 200 OFFSET ?`
      )
      .all(offset);

    return NextResponse.json({ ok: true, payments, page, hasMore: payments.length === 200 });
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
    const {
      tenant_id,
      amount,
      plan,
      status,
      payment_method,
      period_from,
      period_to,
      notes,
    } = body as {
      tenant_id?: number | string;
      amount?: number | string;
      plan?: string;
      status?: string;
      payment_method?: string;
      period_from?: string;
      period_to?: string;
      notes?: string;
    };

    if (amount == null || isNaN(Number(amount))) {
      return NextResponse.json({ ok: false, error: "amount is required and must be a number" }, { status: 400 });
    }

    const db = getDbAsync();
    const result = await db
      .prepare(
        `INSERT INTO ca_payments
           (tenant_id, amount, plan, status, payment_method, period_from, period_to, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        tenant_id != null ? Number(tenant_id) : null,
        Number(amount),
        plan ? String(plan).trim() : null,
        status ? String(status).trim() : "pending",
        payment_method ? String(payment_method).trim() : null,
        period_from ? String(period_from).trim() : null,
        period_to ? String(period_to).trim() : null,
        notes ? String(notes).trim() : null
      );

    return NextResponse.json({ ok: true, id: result.lastInsertRowid }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
