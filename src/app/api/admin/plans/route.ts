/**
 * CA Admin — управление тарифными планами.
 *
 * GET  → список всех планов (ORDER BY price_monthly ASC)
 * POST → создать или обновить план (по id в теле)
 * PUT  → обновить план (id + поля в теле)
 *
 * Защищён Bearer CA_ADMIN_TOKEN.
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

interface PlanRow {
  id: number;
  name: string;
  price_monthly: number;
  price_annual: number | null;
  calls_limit: number;
  managers_limit: number | null;
  features_json: string | null;
  active: number | boolean;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const db = getDbAsync();
    const rows = await db
      .prepare(`SELECT * FROM ca_plans ORDER BY price_monthly ASC`)
      .all<PlanRow>();

    const plans = rows.map((r) => ({
      id: r.id,
      name: r.name,
      price_monthly: r.price_monthly,
      price_annual: r.price_annual,
      calls_limit: r.calls_limit,
      managers_limit: r.managers_limit,
      features_json: r.features_json,
      active: !!r.active,
      created_at: String(r.created_at ?? ""),
    }));

    return NextResponse.json({ ok: true, plans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { id, name, price_monthly, price_annual, calls_limit, managers_limit, features_json, active } = body;
    const db = getDbAsync();

    if (id) {
      // Update existing
      await db
        .prepare(
          `UPDATE ca_plans SET
             name = ?, price_monthly = ?, price_annual = ?,
             calls_limit = ?, managers_limit = ?, features_json = ?, active = ?
           WHERE id = ?`
        )
        .run(
          name, price_monthly, price_annual ?? null,
          calls_limit, managers_limit ?? null, features_json ?? null,
          active !== undefined ? (active ? 1 : 0) : 1,
          id
        );
      return NextResponse.json({ ok: true, updated: id });
    } else {
      // Insert new
      const r = await db
        .prepare(
          `INSERT INTO ca_plans (name, price_monthly, price_annual, calls_limit, managers_limit, features_json, active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          name, price_monthly, price_annual ?? null,
          calls_limit, managers_limit ?? null, features_json ?? null,
          active !== undefined ? (active ? 1 : 0) : 1
        );
      return NextResponse.json({ ok: true, id: r.lastInsertRowid });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const { id, name, price_monthly, price_annual, calls_limit, managers_limit, features_json, active } = body;

    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

    const db = getDbAsync();
    await db
      .prepare(
        `UPDATE ca_plans SET
           name = ?, price_monthly = ?, price_annual = ?,
           calls_limit = ?, managers_limit = ?, features_json = ?, active = ?
         WHERE id = ?`
      )
      .run(
        name, price_monthly, price_annual ?? null,
        calls_limit, managers_limit ?? null, features_json ?? null,
        active !== undefined ? (active ? 1 : 0) : 1,
        id
      );

    return NextResponse.json({ ok: true, updated: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
