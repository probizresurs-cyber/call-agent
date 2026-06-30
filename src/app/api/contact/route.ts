/**
 * /api/contact
 *
 * POST — ПУБЛИЧНЫЙ (без авторизации): приём заявки с контактной формы
 *        лендинга /about. Валидирует, ограничивает длину (анти-мусор),
 *        сохраняет в contact_requests. Внешней отправки нет — заявки
 *        копятся в БД, смотрим на /contact-requests.
 *
 * GET  — за авторизацией (owner/admin/head): список заявок.
 *
 * Все ответы — ВСЕГДА JSON (catch → JSON 500), никогда HTML.
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 16 * 1024; // 16 КБ — форма маленькая
const MAX_NAME = 200;
const MAX_FIELD = 300;
const MAX_MESSAGE = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown, max = MAX_FIELD): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Некорректное тело запроса" }, { status: 400 });
    }

    const raw = JSON.stringify(body);
    if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Слишком большой объём данных" }, { status: 400 });
    }

    const name = str(body.name, MAX_NAME);
    const phone = str(body.phone);
    const email = str(body.email);
    const message = str(body.message, MAX_MESSAGE);
    const marketingConsent = body.marketing_consent === true || body.marketing_consent === 1;
    const consentPd = body.consent_pd === true || body.consent_pd === 1;

    // Согласие на обработку ПДн — обязательно (защита на сервере, не только в UI).
    if (!consentPd) {
      return NextResponse.json(
        { ok: false, error: "Требуется согласие на обработку персональных данных" },
        { status: 400 }
      );
    }
    // Нужны имя и хотя бы один способ связи.
    if (!name || (!phone && !email)) {
      return NextResponse.json(
        { ok: false, error: "Укажите имя и телефон или email" },
        { status: 400 }
      );
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: "Некорректный email" }, { status: 400 });
    }

    const ua = (req.headers.get("user-agent") || "").slice(0, 400);

    const db = getDbAsync();
    await db
      .prepare(
        `INSERT INTO contact_requests
           (name, phone, email, message, marketing_consent, source, user_agent, status)
         VALUES (?, ?, ?, ?, ?, 'landing', ?, 'new')`
      )
      .run(name, phone || null, email || null, message || null, marketingConsent ? 1 : 0, ua || null);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[contact] POST failed:", msg);
    return NextResponse.json({ ok: false, error: "Не удалось отправить заявку" }, { status: 500 });
  }
}

interface ContactRow {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  marketing_consent: number;
  source: string | null;
  status: string;
  created_at: string;
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canViewTeam(me.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const db = getDbAsync();
    const rows = await db
      .prepare(
        `SELECT id, name, phone, email, message, marketing_consent, source, status, created_at
           FROM contact_requests
          ORDER BY created_at DESC`
      )
      .all<ContactRow>();
    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[contact] GET failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
