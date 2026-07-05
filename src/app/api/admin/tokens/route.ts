/**
 * CA Admin — токены аккаунтов (баланс / история / сводка / пополнение / промо /
 * начисление тарифа / enforcement).
 *
 * GET  ?tenantId=&from=&to=  → { balances, plans, ledger?, summary?, settings? }
 *   без tenantId — список балансов всех аккаунтов + активные тарифы (plans);
 *   с tenantId — плюс история (ledger), сводка (summary) и настройки биллинга (settings).
 * POST body { action, tenantId, ... }:
 *   - topup:      { amount, note? }      — пополнить
 *   - adjust:     { delta, note? }       — ручная правка (+/-)
 *   - promo:      { code }               — начислить бонус промокода
 *   - grant_plan: { planId }             — начислить токены выбранного тарифа
 *   - enforce:    { enforce?, lowThreshold? } — настройки биллинга тенанта
 *
 * Защищён Bearer CA_ADMIN_TOKEN.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getAllBalances, getLedger, getPeriodSummary, addTokens, applyPromoTokens, getBalance,
  listPlans, grantPlanTokens, getTokenSettings, setTokenSettings,
} from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CA_ADMIN_TOKEN;
  if (!expected || expected.length < 16) return false;
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return !!m && m[1].trim() === expected;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const tenantId = sp.get("tenantId") ? Number(sp.get("tenantId")) : null;
  const from = sp.get("from") || undefined;
  const to = sp.get("to") || undefined;

  const [balances, plans] = await Promise.all([getAllBalances(), listPlans()]);
  if (!tenantId) return NextResponse.json({ ok: true, balances, plans });

  const [balance, ledger, summary, settings] = await Promise.all([
    getBalance(tenantId),
    getLedger(tenantId, { from, to, limit: 300 }),
    getPeriodSummary(tenantId, from, to),
    getTokenSettings(tenantId),
  ]);
  return NextResponse.json({ ok: true, balances, plans, tenantId, balance, ledger, summary, settings });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    action?: string; tenantId?: number; amount?: number; delta?: number; note?: string; code?: string;
    planId?: number; enforce?: boolean; lowThreshold?: number;
    periodEnd?: string | null; notifyEnabled?: boolean; notifyEmails?: string[];
  };
  const tenantId = Number(body.tenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return NextResponse.json({ ok: false, error: "tenantId обязателен" }, { status: 400 });
  }

  try {
    if (body.action === "topup") {
      const amount = Math.trunc(Number(body.amount));
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
        return NextResponse.json({ ok: false, error: "amount должен быть 1..10000000" }, { status: 400 });
      }
      await addTokens(tenantId, amount, "topup", { note: body.note?.slice(0, 300) });
    } else if (body.action === "adjust") {
      const delta = Math.trunc(Number(body.delta));
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 10_000_000) {
        return NextResponse.json({ ok: false, error: "delta должен быть ненулевым, |delta| ≤ 10000000" }, { status: 400 });
      }
      await addTokens(tenantId, delta, "manual", { note: body.note?.slice(0, 300) });
    } else if (body.action === "promo") {
      const res = await applyPromoTokens(tenantId, String(body.code || ""));
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    } else if (body.action === "grant_plan") {
      const res = await grantPlanTokens(tenantId, Number(body.planId));
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    } else if (body.action === "enforce" || body.action === "billing_settings") {
      const next = await setTokenSettings(tenantId, {
        enforce: typeof body.enforce === "boolean" ? body.enforce : undefined,
        lowThreshold: body.lowThreshold != null ? Number(body.lowThreshold) : undefined,
        periodEnd: body.periodEnd !== undefined ? body.periodEnd : undefined,
        notifyEnabled: typeof body.notifyEnabled === "boolean" ? body.notifyEnabled : undefined,
        notifyEmails: Array.isArray(body.notifyEmails) ? body.notifyEmails : undefined,
      });
      const balance = await getBalance(tenantId);
      return NextResponse.json({ ok: true, tenantId, balance, settings: next });
    } else {
      return NextResponse.json({ ok: false, error: "Неизвестное действие" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  const balance = await getBalance(tenantId);
  return NextResponse.json({ ok: true, tenantId, balance });
}
