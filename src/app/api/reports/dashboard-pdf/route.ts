/**
 * GET /api/reports/dashboard-pdf — серверный экспорт дашборда в PDF.
 *
 * Рендерит СВОЙ же дашборд headless-браузером (chromium) и отдаёт готовый A4-PDF
 * с полями. Так отчёт получается одинаковым и не зависит от настроек диалога
 * печати браузера пользователя (Ctrl+P раскладывал по ширине окна и резал таблицы).
 *
 * Доступ: те, кто видит командный дашборд (canViewTeam) — owner/admin/head/demo.
 * Менеджеру не даём (у него личный кабинет, не отчёт для руководства).
 *
 * Параметры периода/фильтров прокидываются в дашборд как есть (from/to/manager_id/with_crm).
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, canViewTeam } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Простой in-process замок: не даём запустить два chromium одновременно
// (2 CPU / ограниченная RAM). Второй запрос ждёт освобождения.
let busy: Promise<void> | null = null;

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canViewTeam(me.role) && me.role !== "demo") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const session = (await cookies()).get("ca_session")?.value;
  if (!session) return NextResponse.json({ ok: false, error: "no session" }, { status: 401 });

  // Пробрасываем только известные фильтры дашборда (без tv/period — это ТВ-режим).
  const src = req.nextUrl.searchParams;
  const qs = new URLSearchParams();
  for (const k of ["from", "to", "manager_id", "with_crm"]) {
    const v = src.get(k);
    if (v) qs.set(k, v);
  }
  const target = `http://127.0.0.1:${process.env.PORT || 3030}/call-agent/dashboard${qs.toString() ? `?${qs}` : ""}`;

  // Ждём, пока освободится предыдущий рендер (макс. один chromium за раз).
  while (busy) { try { await busy; } catch { /* ignore */ } }
  let release!: () => void;
  busy = new Promise<void>((r) => (release = r));

  try {
    const pdf = await renderPdf(target, session);
    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dashboard-${today}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[dashboard-pdf] render failed:", (e as Error).message);
    return NextResponse.json({ ok: false, error: "render_failed" }, { status: 500 });
  } finally {
    release();
    busy = null;
  }
}

async function renderPdf(url: string, session: string): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  const chromium = (await import("@sparticuz/chromium")).default;

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: "shell",
  });
  try {
    const page = await browser.newPage();
    await page.setCookie({ name: "ca_session", value: session, domain: "127.0.0.1", path: "/" });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
    // Дать догрузиться клиентским блокам (графики) — короткая пауза.
    await new Promise((r) => setTimeout(r, 1200));
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      scale: 0.92,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
