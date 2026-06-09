/**
 * POST /api/reports/chats/validate — проверить что чат существует и доступен боту.
 *
 * Body: { chatId: string } — может быть "chatN" или просто "N".
 * Используется при ручном вводе ID в форме расписания.
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { validateChatId } from "@/lib/bitrix-im";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!canViewTeam(me.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as { chatId?: unknown };
    const chatId = typeof body.chatId === "string" ? body.chatId : "";
    if (!chatId.trim()) {
      return NextResponse.json({ ok: false, error: "Введите ID чата" }, { status: 400 });
    }
    const r = await validateChatId(chatId);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/chats/validate] POST failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
