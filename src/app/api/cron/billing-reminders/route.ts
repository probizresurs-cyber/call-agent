/**
 * GET|POST /api/cron/billing-reminders — ежедневный проход уведомлений о балансе
 * и приближении конца периода (email клиенту + баннер на платформе).
 *
 * Auth: заголовок X-Cron-Secret === env CA_CRON_SECRET (или ?secret=).
 * Запускать раз в сутки (crontab). Идемпотентно: дедуп по ca_billing_reminders.
 */
import { NextRequest, NextResponse } from "next/server";
import { runBillingReminders } from "@/lib/billing-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CA_CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const h = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return h === secret || bearer === secret;
}

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const results = await runBillingReminders();
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (e) {
    console.error("[billing-reminders] failed:", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
