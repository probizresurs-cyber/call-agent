/**
 * GET /api/reports/chats — список диалогов бота в Bitrix.
 *
 * Используется в UI расписаний для селектора чатов. Best-effort: если бот
 * ещё не зарегистрирован или im.recent.get не доступен — вернёт пустой массив.
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { listBotChats } from "@/lib/bitrix-im";

export const runtime = "nodejs";

export async function GET() {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!canViewTeam(me.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const items = await listBotChats();
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    // listBotChats и так не бросает, но на всякий случай.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/chats] GET failed:", msg);
    return NextResponse.json({ ok: true, items: [] });
  }
}
