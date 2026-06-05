/**
 * GET  /api/settings/model — текущая модель анализа для тенанта.
 * POST /api/settings/model { model: string|null } — сохранить выбранную модель.
 *
 * Гард: только owner / admin / head.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

const ALLOWED_MODELS = [
  "openai:gpt-4o-mini",
  "openai:gpt-4o",
  "anthropic:claude-haiku-4-5",
  "anthropic:claude-sonnet-4-6",
] as const;

type AllowedModel = (typeof ALLOWED_MODELS)[number];

function isAllowedModel(v: unknown): v is AllowedModel {
  return typeof v === "string" && (ALLOWED_MODELS as readonly string[]).includes(v);
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (me.role !== "owner" && me.role !== "admin" && me.role !== "head") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const db = getDbAsync();
  const row = await db
    .prepare("SELECT analysis_model FROM tenants WHERE id = ?")
    .get<{ analysis_model: string | null }>(me.tenantId)
    .catch(() => null);

  return NextResponse.json({ ok: true, model: row?.analysis_model ?? null });
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

  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  const model = body.model;

  // null = сброс к серверному дефолту, строка = одна из разрешённых
  if (model !== null && model !== undefined && !isAllowedModel(model)) {
    return NextResponse.json(
      {
        ok: false,
        error: `model must be null or one of: ${ALLOWED_MODELS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    const db = getDbAsync();
    await db
      .prepare("UPDATE tenants SET analysis_model = ? WHERE id = ?")
      .run(model ?? null, me.tenantId);
  } catch (e) {
    const msg = (e as Error).message;
    // Колонка analysis_model может не существовать если миграция ещё не накатилась
    if (msg.includes("no such column") || msg.includes("does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Колонка analysis_model не найдена в БД. Перезапустите сервер для применения миграций." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, model: model ?? null });
}
