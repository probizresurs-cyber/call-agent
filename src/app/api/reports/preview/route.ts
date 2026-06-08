/**
 * POST /api/reports/preview
 *
 * Генерирует текст отчёта по менеджеру или команде за период — НЕ отправляет его.
 * Используется кнопкой «Сформировать превью» на странице /reports.
 *
 * Body: { scope: "manager"|"team", managerId?, from?, to?, periodLabel? }
 * Доступ: owner / admin / head (canViewTeam).
 *
 * generateReport() реализует параллельный агент в @/lib/reports.
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { generateReport, type ReportOpts } from "@/lib/reports";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canViewTeam(me.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    scope?: unknown;
    managerId?: unknown;
    from?: unknown;
    to?: unknown;
    periodLabel?: unknown;
  };

  const scope = body.scope === "team" ? "team" : "manager";
  const managerId = typeof body.managerId === "string" && body.managerId.trim()
    ? body.managerId.trim()
    : undefined;

  if (scope === "manager" && !managerId) {
    return NextResponse.json(
      { ok: false, error: "Для отчёта по менеджеру нужно выбрать менеджера" },
      { status: 400 }
    );
  }

  const opts: ReportOpts = {
    tenantId: me.tenantId,
    scope,
    managerId,
    from: typeof body.from === "string" && body.from ? body.from : undefined,
    to: typeof body.to === "string" && body.to ? body.to : undefined,
    periodLabel: typeof body.periodLabel === "string" && body.periodLabel ? body.periodLabel : undefined,
  };

  try {
    const report = await generateReport(opts);
    return NextResponse.json({ ok: true, title: report.title, text: report.text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/preview] generateReport failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
