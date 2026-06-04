/**
 * Настройки модуля «Сравнение с CRM-карточкой» (UF_CRM_* discrepancy check).
 *
 * GET  /api/settings/discrepancy — текущие значения для тенанта пользователя.
 * POST /api/settings/discrepancy — обновить настройки.
 *
 * Доступ: только owner/admin/head.
 * Параметры храним в колонках tenants.discrepancy_* (создаёт другой агент в schema).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const runtime = "nodejs";

type RecipientMode = "manager" | "admins";
type ActionMode = "manual" | "auto_approve";
type Severity = "low" | "medium" | "high";

const RECIPIENT_MODES: RecipientMode[] = ["manager", "admins"];
const ACTION_MODES: ActionMode[] = ["manual", "auto_approve"];
const SEVERITIES: Severity[] = ["low", "medium", "high"];

interface DiscrepancyRow {
  discrepancy_enabled: boolean | number | null;
  discrepancy_recipient_mode: string | null;
  discrepancy_admin_user_ids: string | null;
  discrepancy_action_mode: string | null;
  discrepancy_custom_fields: string | null;
  discrepancy_severity_min: string | null;
}

export interface DiscrepancySettings {
  enabled: boolean;
  recipientMode: RecipientMode;
  adminUserIds: number[];
  actionMode: ActionMode;
  customFields: string[] | null;
  severityMin: Severity;
}

function parseJsonArray<T>(raw: string | null, fallback: T): T | unknown[] {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Нормализуем row из tenants → DiscrepancySettings с дефолтами. */
function rowToSettings(row: DiscrepancyRow | undefined): DiscrepancySettings {
  if (!row) {
    return {
      enabled: false,
      recipientMode: "manager",
      adminUserIds: [],
      actionMode: "manual",
      customFields: null,
      severityMin: "medium",
    };
  }
  const recipientMode = RECIPIENT_MODES.includes(row.discrepancy_recipient_mode as RecipientMode)
    ? (row.discrepancy_recipient_mode as RecipientMode)
    : "manager";
  const actionMode = ACTION_MODES.includes(row.discrepancy_action_mode as ActionMode)
    ? (row.discrepancy_action_mode as ActionMode)
    : "manual";
  const severityMin = SEVERITIES.includes(row.discrepancy_severity_min as Severity)
    ? (row.discrepancy_severity_min as Severity)
    : "medium";
  const adminUserIdsRaw = parseJsonArray<number[]>(row.discrepancy_admin_user_ids, []);
  const adminUserIds = (Array.isArray(adminUserIdsRaw) ? adminUserIdsRaw : [])
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);
  const customFieldsRaw = row.discrepancy_custom_fields == null
    ? null
    : parseJsonArray<string[]>(row.discrepancy_custom_fields, []);
  const customFields = customFieldsRaw === null
    ? null
    : (Array.isArray(customFieldsRaw) ? customFieldsRaw.map(String).filter(Boolean) : []);
  return {
    enabled: row.discrepancy_enabled === true || row.discrepancy_enabled === 1,
    recipientMode,
    adminUserIds,
    actionMode,
    customFields,
    severityMin,
  };
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner" && me.role !== "admin" && me.role !== "head") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const db = getDbAsync();
  const row = await db
    .prepare(
      `SELECT discrepancy_enabled, discrepancy_recipient_mode, discrepancy_admin_user_ids,
              discrepancy_action_mode, discrepancy_custom_fields, discrepancy_severity_min
         FROM tenants WHERE id = ?`
    )
    .get<DiscrepancyRow>(me.tenantId);
  return NextResponse.json({ ok: true, settings: rowToSettings(row) });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role !== "owner" && me.role !== "admin" && me.role !== "head") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: unknown;
    recipientMode?: unknown;
    adminUserIds?: unknown;
    actionMode?: unknown;
    customFields?: unknown;
    severityMin?: unknown;
  };

  const enabled = body.enabled === true;
  const recipientMode = RECIPIENT_MODES.includes(body.recipientMode as RecipientMode)
    ? (body.recipientMode as RecipientMode)
    : null;
  if (!recipientMode) {
    return NextResponse.json({ ok: false, error: "recipientMode must be 'manager' or 'admins'" }, { status: 400 });
  }
  const actionMode = ACTION_MODES.includes(body.actionMode as ActionMode)
    ? (body.actionMode as ActionMode)
    : null;
  if (!actionMode) {
    return NextResponse.json({ ok: false, error: "actionMode must be 'manual' or 'auto_approve'" }, { status: 400 });
  }
  const severityMin = SEVERITIES.includes(body.severityMin as Severity)
    ? (body.severityMin as Severity)
    : null;
  if (!severityMin) {
    return NextResponse.json({ ok: false, error: "severityMin must be 'low'|'medium'|'high'" }, { status: 400 });
  }

  // adminUserIds — массив целых положительных. Если режим 'manager', игнорируем содержимое (сохраняем []).
  let adminUserIds: number[] = [];
  if (Array.isArray(body.adminUserIds)) {
    adminUserIds = body.adminUserIds
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0);
  } else if (body.adminUserIds != null) {
    return NextResponse.json({ ok: false, error: "adminUserIds must be an array of integers" }, { status: 400 });
  }
  if (recipientMode === "manager") adminUserIds = [];

  // Проверим что выбранные адресаты — реально пользователи этого тенанта с подходящей ролью.
  const db = getDbAsync();
  if (recipientMode === "admins" && adminUserIds.length > 0) {
    const placeholders = adminUserIds.map(() => "?").join(",");
    const valid = await db
      .prepare(
        `SELECT id FROM users
          WHERE tenant_id = ?
            AND role IN ('head','owner','admin')
            AND id IN (${placeholders})`
      )
      .all<{ id: number }>(me.tenantId, ...adminUserIds);
    const validSet = new Set(valid.map((r) => Number(r.id)));
    adminUserIds = adminUserIds.filter((id) => validSet.has(id));
  }

  // customFields — массив строк или null. Пустой массив == все UF_CRM_* (=> null).
  let customFields: string[] | null = null;
  if (body.customFields === null || body.customFields === undefined) {
    customFields = null;
  } else if (Array.isArray(body.customFields)) {
    const arr = body.customFields
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
    customFields = arr.length === 0 ? null : arr;
  } else {
    return NextResponse.json({ ok: false, error: "customFields must be an array of strings or null" }, { status: 400 });
  }

  await db
    .prepare(
      `UPDATE tenants
          SET discrepancy_enabled = ?,
              discrepancy_recipient_mode = ?,
              discrepancy_admin_user_ids = ?,
              discrepancy_action_mode = ?,
              discrepancy_custom_fields = ?,
              discrepancy_severity_min = ?
        WHERE id = ?`
    )
    .run(
      enabled,
      recipientMode,
      JSON.stringify(adminUserIds),
      actionMode,
      customFields === null ? null : JSON.stringify(customFields),
      severityMin,
      me.tenantId,
    );

  return NextResponse.json({
    ok: true,
    settings: {
      enabled,
      recipientMode,
      adminUserIds,
      actionMode,
      customFields,
      severityMin,
    } satisfies DiscrepancySettings,
  });
}
