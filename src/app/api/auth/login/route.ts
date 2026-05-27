import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { user, password } = (await req.json()) as { user?: string; password?: string };
  if (!user || !password) {
    return NextResponse.json({ ok: false, error: "user / password обязательны" }, { status: 400 });
  }
  try {
    const ok = await login(user, password);
    if (!ok) return NextResponse.json({ ok: false, error: "Неверный логин или пароль" }, { status: 401 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
