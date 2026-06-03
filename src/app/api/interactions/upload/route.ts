/**
 * POST /api/interactions/upload
 *
 * Ручная загрузка взаимодействия:
 *   - chat — текст переписки (WhatsApp/Telegram/VK экспорт или копипаст)
 *   - email — текст письма (one message или цепочка)
 *   - meeting — текст транскрипта встречи ИЛИ audio/video файл (то же что и звонок)
 *
 * Создаёт запись в calls (= interactions) и кидает её в очередь обработки.
 * Анализ запустится воркером — pipeline.ts уже умеет работать с content_text без аудио.
 *
 * multipart/form-data:
 *   type:         "chat" | "email" | "meeting"
 *   channel:      "whatsapp" | "telegram" | "vk" | "email_imap" | "zoom" | "yandex_telemost" | "other"
 *   direction:    "in" | "out" | null
 *   manager_id:   опционально, Bitrix user ID
 *   client_phone: опционально, нормализованный номер
 *   client_name:  опционально, имя клиента
 *   started_at:   ISO timestamp (если не передан — now)
 *   content_text: для chat/email/meeting-text — обязательно
 *   file:         для meeting с аудио — application/octet-stream
 *
 * Доступ: owner / admin / head (менеджеры не могут грузить взаимодействия за других).
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";
import { ManualUploadAdapter } from "@/lib/interaction-source";
import type { InteractionType, InteractionChannel } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

const RECORDINGS_DIR = process.env.RECORDINGS_DIR
  ? path.resolve(process.env.RECORDINGS_DIR)
  : path.join(process.cwd(), "storage", "recordings");

const VALID_TYPES: InteractionType[] = ["chat", "email", "meeting"];
const VALID_CHANNELS: InteractionChannel[] = [
  "whatsapp", "telegram", "email_imap", "zoom", "yandex_telemost", "other", "manual", "dictaphone",
];

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role === "manager") {
    return NextResponse.json({ ok: false, error: "forbidden — manager не может грузить" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "bad form-data" }, { status: 400 });

  const type = (form.get("type") as string) as InteractionType;
  const channel = ((form.get("channel") as string) || "manual") as InteractionChannel;
  const direction = (form.get("direction") as string) as "in" | "out" | null;
  const managerId = (form.get("manager_id") as string) || null;
  const clientPhone = (form.get("client_phone") as string) || null;
  const clientName = (form.get("client_name") as string) || null;
  const bitrixDealId = (form.get("bitrix_deal_id") as string) || null;
  const bitrixLeadId = (form.get("bitrix_lead_id") as string) || null;
  const bitrixContactId = (form.get("bitrix_contact_id") as string) || null;
  const startedAtRaw = (form.get("started_at") as string) || "";
  const contentText = (form.get("content_text") as string) || null;
  const file = form.get("file") as File | null;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ ok: false, error: "type must be chat/email/meeting" }, { status: 400 });
  }
  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json({ ok: false, error: "unknown channel" }, { status: 400 });
  }

  // Один из источников контента обязателен
  if (!contentText && !file) {
    return NextResponse.json({ ok: false, error: "Нужен content_text или file" }, { status: 400 });
  }

  // Генерим уникальный externalId — используется для идемпотентности.
  // При повторной загрузке того же файла создаст новую запись (так и должно быть для manual).
  const externalId = crypto.randomBytes(8).toString("hex");

  // Если загружен файл — сохраняем в storage/recordings/manual/
  let recordingPath: string | null = null;
  if (file && type === "meeting") {
    const dir = path.join(RECORDINGS_DIR, "manual");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file.name) || ".bin";
    const safeName = `${externalId}${ext}`;
    recordingPath = path.join(dir, safeName);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(recordingPath, buf);
  }

  // Стартовый статус определяет тип контента:
  //   - если есть аудио (recordingPath) — pending (запускает download/transcribe/analyze)
  //   - если только текст — тоже pending (pipeline пропустит транскрипцию через text-only ветку)
  const adapter = new ManualUploadAdapter();
  const callId = await adapter.save({
    externalId,
    tenantId: me.tenantId,
    type,
    channel,
    direction,
    managerId,
    clientPhone,
    clientName,
    bitrixDealId,
    bitrixLeadId,
    bitrixContactId,
    startedAt: startedAtRaw || new Date().toISOString().replace("T", " ").slice(0, 19),
    durationSec: type === "meeting" ? 0 : 0,  // для chat/email — 0; для meeting — узнаем после транскрипции
    contentText,
    recordingUrl: null,
    initialStatus: "pending",
  });

  if (!callId) {
    return NextResponse.json({ ok: false, error: "Дубль (уже загружено)" }, { status: 409 });
  }

  // Если был файл — фиксируем путь в recording_path чтобы pipeline не пытался качать.
  if (recordingPath) {
    const { getDbAsync } = await import("@/lib/db-compat");
    await getDbAsync()
      .prepare(`UPDATE calls SET recording_path = ? WHERE id = ?`)
      .run(recordingPath, callId);
  }

  return NextResponse.json({ ok: true, callId, type, channel });
}
