/**
 * GET  /api/settings/glossary — текущий глоссарий названий для тенанта.
 * POST /api/settings/glossary { glossary: string } — сохранить глоссарий.
 *
 * Глоссарий — список правильных написаний названий компаний/продуктов/терминов.
 * Подставляется в промпт анализатора, чтобы AI не путал «Орлинг»/«Арлинк» → «Орлинк».
 *
 * Гард: GET — owner/admin/head; POST (запись) — owner/admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

const MAX_GLOSSARY_LEN = 5000;

export async function GET() {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (me.role !== "owner" && me.role !== "admin" && me.role !== "head") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const db = getDbAsync();
    const row = await db
      .prepare("SELECT glossary FROM tenants WHERE id = ?")
      .get<{ glossary: string | null }>(me.tenantId)
      .catch(() => null);
    return NextResponse.json({ ok: true, glossary: row?.glossary ?? "" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // POST (write) — только owner и admin; head может только читать через GET
  if (me.role !== "owner" && me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { glossary?: unknown };
  const raw = body.glossary;

  if (typeof raw !== "string") {
    return NextResponse.json(
      { ok: false, error: "glossary must be a string" },
      { status: 400 }
    );
  }
  if (raw.length > MAX_GLOSSARY_LEN) {
    return NextResponse.json(
      { ok: false, error: `Глоссарий слишком длинный — максимум ${MAX_GLOSSARY_LEN} символов` },
      { status: 400 }
    );
  }

  // Пустую строку храним как NULL — чтобы анализатор не добавлял пустой блок в промпт.
  const value = raw.trim() === "" ? null : raw;

  try {
    const db = getDbAsync();
    await db
      .prepare("UPDATE tenants SET glossary = ? WHERE id = ?")
      .run(value, me.tenantId);
  } catch (e) {
    const msg = (e as Error).message;
    // Колонка glossary может не существовать если миграция ещё не накатилась
    if (msg.includes("no such column") || msg.includes("does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Колонка glossary не найдена в БД. Перезапустите сервер для применения миграций." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, glossary: value ?? "" });
}
