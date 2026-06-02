/**
 * GET  /api/budget — текущие лимиты + накопленный расход за месяц.
 * POST /api/budget { maxAnthropicTokens, maxOpenaiSeconds, action } — обновить (owner/admin).
 *
 * Расход считается за календарный месяц (UTC), не за rolling 30 дней — так понятнее
 * пользователю и совпадает с биллинг-периодом провайдеров.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getTenantBudget, setTenantBudget, getMonthlyUsage, type BudgetAction } from "@/lib/budget";

export const runtime = "nodejs";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const [budget, usage] = await Promise.all([
    getTenantBudget(me.tenantId),
    getMonthlyUsage(me.tenantId),
  ]);
  return NextResponse.json({ ok: true, budget, usage });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner" && me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    maxAnthropicTokens?: number | null;
    maxOpenaiSeconds?: number | null;
    action?: BudgetAction;
  };
  await setTenantBudget(me.tenantId, {
    maxAnthropicTokens: body.maxAnthropicTokens === null ? null : body.maxAnthropicTokens,
    maxOpenaiSeconds:   body.maxOpenaiSeconds   === null ? null : body.maxOpenaiSeconds,
    action: body.action,
  });
  const [budget, usage] = await Promise.all([
    getTenantBudget(me.tenantId),
    getMonthlyUsage(me.tenantId),
  ]);
  return NextResponse.json({ ok: true, budget, usage });
}
