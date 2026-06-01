/**
 * Принимает события от Bitrix24 (исходящий вебхук).
 * События которые нас интересуют:
 *   OnVoximplantCallEnd — встроенная телефония
 *   ONCRMACTIVITYADD / UPDATE с PROVIDER_TYPE_ID = 'CALL' — внешняя АТС
 *
 * В body Битрикс присылает application/x-www-form-urlencoded.
 * Проверяем токен (либо в query ?token=, либо в поле auth.application_token).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { voxGetStatistic, crmActivityGet, entityTypeStringToId } from "@/lib/bitrix";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = process.env.BITRIX_INBOUND_TOKEN;

  // 1. Парсим тело — Битрикс шлёт urlencoded
  const ct = req.headers.get("content-type") || "";
  let payload: Record<string, string> = {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const raw = await req.text();
    payload = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  } else if (ct.includes("application/json")) {
    payload = await req.json();
  } else {
    payload = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  }

  // 2. Проверяем токен
  const queryToken = req.nextUrl.searchParams.get("token");
  const bodyToken = payload["auth[application_token]"] || payload["application_token"];
  const provided = queryToken || bodyToken;
  if (token && provided !== token) {
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
  }

  const event = payload["event"] || payload["EVENT"] || "";
  const callId =
    payload["data[CALL_ID]"] ||
    payload["data[ID]"] ||
    payload["data[FIELDS][ID]"] ||
    "";

  try {
    if (event === "OnVoximplantCallEnd" && callId) {
      await ingestVoxCall(callId);
    } else if (
      (event === "ONCRMACTIVITYADD" || event === "ONCRMACTIVITYUPDATE") &&
      callId
    ) {
      await ingestCrmActivity(callId);
    } else {
      // Неизвестное событие — просто логируем
      console.warn("[webhook] unknown event", event, callId);
    }
  } catch (e) {
    console.error("[webhook] error:", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function ingestVoxCall(callId: string) {
  const stat = await voxGetStatistic(callId);
  if (!stat) return;
  const recordingUrl = stat.CALL_RECORD_URL || stat.CALL_WEBDAV_URL || null;
  if (!recordingUrl) {
    // Без записи нечего обрабатывать
    return;
  }

  const db = getDb();
  const entityType = entityTypeStringToId(stat.CRM_ENTITY_TYPE);
  db.prepare(
    `INSERT INTO calls
      (bitrix_call_id, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id,
       bitrix_activity_id, manager_id, client_phone, direction,
       started_at, duration_sec, recording_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(bitrix_call_id) DO NOTHING`
  ).run(
    callId,
    entityType === 2 ? stat.CRM_ENTITY_ID ?? null : null,
    entityType === 1 ? stat.CRM_ENTITY_ID ?? null : null,
    entityType === 3 ? stat.CRM_ENTITY_ID ?? null : null,
    stat.CRM_ACTIVITY_ID ?? null,
    stat.PORTAL_USER_ID ?? null,
    stat.PHONE_NUMBER ?? null,
    (stat.CALL_TYPE === "1" || stat.CALL_TYPE === "3") ? "in" : "out",
    stat.CALL_START_DATE ?? null,
    Number(stat.CALL_DURATION || 0),
    recordingUrl
  );
}

async function ingestCrmActivity(activityId: string) {
  const a = await crmActivityGet(activityId);
  if (!a || a.PROVIDER_TYPE_ID !== "CALL") return;
  const file = a.FILES?.[0];
  const recordingUrl = file?.urlMachine || file?.url || null;
  if (!recordingUrl) return;

  const db = getDb();
  const entityType = a.OWNER_TYPE_ID ? Number(a.OWNER_TYPE_ID) : null;
  db.prepare(
    `INSERT INTO calls
      (bitrix_call_id, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id,
       bitrix_activity_id, manager_id, started_at, recording_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(bitrix_call_id) DO NOTHING`
  ).run(
    `activity-${a.ID}`,
    entityType === 2 ? a.OWNER_ID ?? null : null,
    entityType === 1 ? a.OWNER_ID ?? null : null,
    entityType === 3 ? a.OWNER_ID ?? null : null,
    a.ID,
    a.RESPONSIBLE_ID ?? null,
    a.START_TIME ?? null,
    recordingUrl
  );
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST events here" });
}
