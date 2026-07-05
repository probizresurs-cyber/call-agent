/**
 * POST /api/public/report-view — трекер заходов на публичный отчёт.
 *
 * Публичный (без логина): зовётся клиентом со страницы /public/dashboard/[token].
 * Ставит зрителю cookie ca_report_viewer (аноним. id), троттлит 10 мин, пишет
 * строку в ca_report_views. IP берём из x-forwarded-for (за nginx).
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { resolveTenantByToken } from "@/lib/dashboard-share";
import { recordView } from "@/lib/report-views";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; kind?: string };
  const token = body.token;
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  const tenantId = await resolveTenantByToken(token);
  if (!tenantId) return NextResponse.json({ ok: false }, { status: 404 });

  const jar = await cookies();
  let viewerId = jar.get("ca_report_viewer")?.value;
  const res = NextResponse.json({ ok: true });
  if (!viewerId) {
    viewerId = crypto.randomBytes(16).toString("hex");
    res.cookies.set("ca_report_viewer", viewerId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent");
  const kind = body.kind === "tv" ? "tv" : "dashboard";

  try {
    await recordView({ tenantId, token, viewerId, kind, ip, userAgent: ua });
  } catch (e) {
    console.error("[report-view] record failed:", (e as Error).message);
  }
  return res;
}
