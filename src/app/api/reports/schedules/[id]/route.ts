/**
 * PATCH /api/reports/schedules/:id — изменить расписание.
 * DELETE /api/reports/schedules/:id — удалить расписание.
 *
 * Tenant guard: расписание должно принадлежать tenantId текущего юзера, иначе 403.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import {
  getSchedule,
  updateSchedule,
  deleteSchedule,
  type SchedulePatch,
  type ScheduleScope,
  type ScheduleRecipientKind,
  type ScheduleFrequency,
  type SchedulePeriodKind,
} from "@/lib/reports-scheduler";

export const runtime = "nodejs";

const VALID_SCOPES: ScheduleScope[] = ["manager", "team"];
const VALID_RECIPIENT_KINDS: ScheduleRecipientKind[] = ["user", "chat"];
const VALID_FREQUENCIES: ScheduleFrequency[] = ["daily", "weekly"];
const VALID_PERIODS: SchedulePeriodKind[] = [
  "yesterday",
  "today",
  "last_7_days",
  "last_week",
  "this_week",
  "last_month",
];
const TIME_RE = /^\d{2}:\d{2}$/;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!canViewTeam(me.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
    }

    // Tenant guard: проверяем что расписание принадлежит этому tenant'у.
    const existing = await getSchedule(id, me.tenantId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Не найдено" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: SchedulePatch = {};

    if (body.name !== undefined) {
      const n = typeof body.name === "string" ? body.name.trim() : "";
      if (!n) return NextResponse.json({ ok: false, error: "Укажите название" }, { status: 400 });
      patch.name = n;
    }
    if (body.scope !== undefined) {
      const v = body.scope as ScheduleScope;
      if (!VALID_SCOPES.includes(v)) {
        return NextResponse.json({ ok: false, error: "Неверный scope" }, { status: 400 });
      }
      patch.scope = v;
    }
    if (body.managerId !== undefined) {
      patch.managerId =
        typeof body.managerId === "string" && body.managerId.trim()
          ? body.managerId.trim()
          : null;
    }
    if (body.recipientKind !== undefined) {
      const v = body.recipientKind as ScheduleRecipientKind;
      if (!VALID_RECIPIENT_KINDS.includes(v)) {
        return NextResponse.json({ ok: false, error: "Неверный recipientKind" }, { status: 400 });
      }
      patch.recipientKind = v;
    }
    if (body.recipientId !== undefined) {
      const v = typeof body.recipientId === "string" ? body.recipientId.trim() : "";
      if (!v) return NextResponse.json({ ok: false, error: "Укажите получателя" }, { status: 400 });
      patch.recipientId = v;
    }
    if (body.recipientName !== undefined) {
      patch.recipientName =
        typeof body.recipientName === "string" && body.recipientName.trim()
          ? body.recipientName.trim()
          : null;
    }
    if (body.frequency !== undefined) {
      const v = body.frequency as ScheduleFrequency;
      if (!VALID_FREQUENCIES.includes(v)) {
        return NextResponse.json({ ok: false, error: "Неверная частота" }, { status: 400 });
      }
      patch.frequency = v;
    }
    if (body.time !== undefined) {
      const v = typeof body.time === "string" ? body.time.trim() : "";
      if (!TIME_RE.test(v)) {
        return NextResponse.json({ ok: false, error: "Время должно быть в формате HH:MM" }, { status: 400 });
      }
      patch.time = v;
    }
    if (body.daysOfWeek !== undefined) {
      const arr = Array.isArray(body.daysOfWeek)
        ? (body.daysOfWeek as unknown[])
            .map((d) => (typeof d === "number" ? d : parseInt(String(d), 10)))
            .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
        : [];
      patch.daysOfWeek = arr.length > 0 ? arr : null;
    }
    if (body.periodKind !== undefined) {
      const v = body.periodKind as SchedulePeriodKind;
      if (!VALID_PERIODS.includes(v)) {
        return NextResponse.json({ ok: false, error: "Неверный period" }, { status: 400 });
      }
      patch.periodKind = v;
    }
    if (body.enabled !== undefined) {
      patch.enabled = !!body.enabled;
    }

    // Финальная сверка: если осталось scope='manager' — managerId должен быть
    const finalScope = patch.scope ?? existing.scope;
    const finalManagerId =
      patch.managerId !== undefined ? patch.managerId : existing.manager_id;
    if (finalScope === "manager" && !finalManagerId) {
      return NextResponse.json(
        { ok: false, error: "Для отчёта по менеджеру нужно указать managerId" },
        { status: 400 }
      );
    }
    // Если в итоге weekly без дней — отказ
    const finalFreq = patch.frequency ?? existing.frequency;
    const finalDays =
      patch.daysOfWeek !== undefined ? patch.daysOfWeek : existing.days_of_week ? safeParseDays(existing.days_of_week) : [];
    if (finalFreq === "weekly" && (!finalDays || finalDays.length === 0)) {
      return NextResponse.json(
        { ok: false, error: "Для еженедельной отправки выберите хотя бы один день недели" },
        { status: 400 }
      );
    }

    const item = await updateSchedule(id, me.tenantId, patch);
    if (!item) {
      return NextResponse.json({ ok: false, error: "Не найдено" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/schedules/:id] PATCH failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!canViewTeam(me.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
    }

    // Tenant guard
    const existing = await getSchedule(id, me.tenantId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Не найдено" }, { status: 404 });
    }

    await deleteSchedule(id, me.tenantId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/schedules/:id] DELETE failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function safeParseDays(json: string): number[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((d) => Number.isFinite(d)) : [];
  } catch {
    return [];
  }
}
