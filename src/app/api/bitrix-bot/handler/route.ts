/**
 * Заглушка-обработчик событий чат-бота «Call-Agent» в Bitrix24.
 *
 * imbot.register требует URL для EVENT_MESSAGE_ADD / EVENT_WELCOME_MESSAGE /
 * EVENT_BOT_DELETE. Наш бот не интерактивный — он только РАССЫЛАЕТ отчёты,
 * не отвечает на сообщения. Поэтому здесь просто 200 OK, чтобы Bitrix считал
 * обработчик валидным. Если в будущем понадобится интерактивность (команды
 * боту) — логику обработки входящих событий добавим сюда.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "Call-Agent bot event handler (noop)" });
}
