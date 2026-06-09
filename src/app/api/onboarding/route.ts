/**
 * /api/onboarding
 *
 * POST — публичный (БЕЗ авторизации): приём заявки с публичной формы
 *        /call-agent/onboarding. Валидирует обязательные поля, ограничивает
 *        длину (защита от мусора), сохраняет в onboarding_requests.
 *
 * GET  — за авторизацией (owner/admin/head): список заявок для страницы
 *        просмотра /onboarding-requests.
 *
 * Все ответы — ВСЕГДА JSON (catch → NextResponse.json со status 500),
 * никогда HTML-страница ошибки.
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

// Лимиты для защиты от мусорных/огромных payload
const MAX_PAYLOAD_BYTES = 50 * 1024; // 50 КБ на весь JSON
const MAX_COMPANY_NAME = 200;
const MAX_FIELD = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Достаёт строковое поле из тела, тримит, ограничивает длину. */
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

    // Защита от огромного payload — считаем размер сериализованного тела
    const raw = JSON.stringify(body);
    if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Слишком большой объём данных" },
        { status: 400 }
      );
    }

    // Ключевые поля → отдельные колонки
    const companyName = str(body.company_name, MAX_COMPANY_NAME);
    const contactName = str(body.contact_name);
    const contactEmail = str(body.contact_email);
    const contactPhone = str(body.contact_phone);
    const bitrixUrl = str(body.bitrix_url);
    const telephonyType = str(body.telephony_type);

    // Валидация обязательных полей
    if (!companyName || !contactName || !contactEmail || !bitrixUrl) {
      return NextResponse.json(
        { ok: false, error: "Заполните обязательные поля: название компании, контакт, email, URL Bitrix24" },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(contactEmail)) {
      return NextResponse.json(
        { ok: false, error: "Некорректный email" },
        { status: 400 }
      );
    }

    // payload_json — весь body (дублирует ключевые поля + хранит остальные ответы)
    const payloadJson = JSON.stringify(body);

    const db = getDbAsync();
    const res = await db
      .prepare(
        `INSERT INTO onboarding_requests
           (company_name, contact_name, contact_email, contact_phone, bitrix_url, telephony_type, status, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`
      )
      .run(
        companyName,
        contactName,
        contactEmail,
        contactPhone || null,
        bitrixUrl,
        telephonyType || null,
        payloadJson
      );

    return NextResponse.json({ ok: true, id: res.lastInsertRowid ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[onboarding] POST failed:", msg);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить заявку" }, { status: 500 });
  }
}

interface OnboardingRow {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  bitrix_url: string;
  telephony_type: string | null;
  status: string;
  payload_json: string | null;
  created_at: string;
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canViewTeam(me.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const db = getDbAsync();
    const rows = await db
      .prepare(
        `SELECT id, company_name, contact_name, contact_email, contact_phone,
                bitrix_url, telephony_type, status, payload_json, created_at
           FROM onboarding_requests
          ORDER BY created_at DESC`
      )
      .all<OnboardingRow>();

    const items = rows.map((r) => {
      let payload: Record<string, unknown> = {};
      if (r.payload_json) {
        try {
          payload = JSON.parse(r.payload_json) as Record<string, unknown>;
        } catch {
          payload = {};
        }
      }
      return { ...r, payload };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[onboarding] GET failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
