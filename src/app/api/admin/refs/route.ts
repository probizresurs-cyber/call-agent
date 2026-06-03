/**
 * Cross-product admin endpoint — реф-ссылки Call-Agent.
 *
 * Защищён shared-secret-токеном через заголовок `Authorization: Bearer ${CA_ADMIN_TOKEN}`
 * (как и /api/admin/users).
 *
 * TODO: реф-ссылки в Call-Agent ещё не реализованы. Сейчас возвращаем пустой список
 * на GET и 501 Not Implemented на POST. Когда появится таблица referrals
 * (миграция drizzle), реализовать здесь полноценно.
 */
import { NextRequest, NextResponse } from "next/server";

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

  // TODO: вернуть рефералки из таблицы `referrals`, когда она появится.
  return NextResponse.json({
    ok: true,
    items: [],
    total: 0,
    notice: "Referral storage is not yet implemented in Call-Agent. See TODO in src/app/api/admin/refs/route.ts.",
  });
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  // TODO: реализовать создание реф-ссылки после добавления таблицы referrals.
  return NextResponse.json(
    {
      ok: false,
      error: "Not implemented yet. Add `referrals` table to Call-Agent schema first.",
    },
    { status: 501 }
  );
}
