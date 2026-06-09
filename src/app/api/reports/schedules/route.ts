/**
 * GET /api/reports/schedules — список расписаний тенанта.
 * POST /api/reports/schedules — создать новое расписание.
 *
 * Доступ: owner / admin / head (canViewTeam).
 *
 * Body POST: {
 *   name, scope: 'manager'|'team', managerId?,
 *   recipientKind: 'user'|'chat', recipientId, recipientName?,
 *   frequency: 'daily'|'weekly', time: 'HH:MM',
 *   daysOfWeek?: number[] (1..7, только для weekly),
 *   periodKind: 'yesterday'|'today'|'last_7_days'|'last_week'|'this_week'|'last_month'
 * }
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import {
  listSchedules,
  createSchedule,
  type ScheduleInput,
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

export async function GET() {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!canViewTeam(me.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const items = await listSchedules(me.tenantId);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/schedules] GET failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!canViewTeam(me.role)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const scope = body.scope as ScheduleScope | undefined;
    const managerId =
      typeof body.managerId === "string" && body.managerId.trim() ? body.managerId.trim() : null;
    const recipientKind = body.recipientKind as ScheduleRecipientKind | undefined;
    const recipientId =
      typeof body.recipientId === "string" ? body.recipientId.trim() : "";
    const recipientName =
      typeof body.recipientName === "string" && body.recipientName.trim()
        ? body.recipientName.trim()
        : null;
    const frequency = body.frequency as ScheduleFrequency | undefined;
    const time = typeof body.time === "string" ? body.time.trim() : "";
    const periodKind = body.periodKind as SchedulePeriodKind | undefined;
    const daysOfWeek = Array.isArray(body.daysOfWeek)
      ? (body.daysOfWeek as unknown[])
          .map((d) => (typeof d === "number" ? d : parseInt(String(d), 10)))
          .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
      : [];

    // Валидация
    if (!name) return NextResponse.json({ ok: false, error: "Укажите название" }, { status: 400 });
    if (!scope || !VALID_SCOPES.includes(scope)) {
      return NextResponse.json({ ok: false, error: "Неверный scope" }, { status: 400 });
    }
    if (scope === "manager" && !managerId) {
      return NextResponse.json(
        { ok: false, error: "Для отчёта по менеджеру нужно указать managerId" },
        { status: 400 }
      );
    }
    if (!recipientKind || !VALID_RECIPIENT_KINDS.includes(recipientKind)) {
      return NextResponse.json({ ok: false, error: "Неверный recipientKind" }, { status: 400 });
    }
    if (!recipientId) {
      return NextResponse.json({ ok: false, error: "Укажите получателя" }, { status: 400 });
    }
    if (!frequency || !VALID_FREQUENCIES.includes(frequency)) {
      return NextResponse.json({ ok: false, error: "Неверная частота" }, { status: 400 });
    }
    if (!TIME_RE.test(time)) {
      return NextResponse.json({ ok: false, error: "Время должно быть в формате HH:MM" }, { status: 400 });
    }
    if (frequency === "weekly" && daysOfWeek.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Для еженедельной отправки выберите хотя бы один день недели" },
        { status: 400 }
      );
    }
    if (!periodKind || !VALID_PERIODS.includes(periodKind)) {
      return NextResponse.json({ ok: false, error: "Неверный period" }, { status: 400 });
    }

    const input: ScheduleInput = {
      tenantId: me.tenantId,
      name,
      scope,
      managerId,
      recipientKind,
      recipientId,
      recipientName,
      frequency,
      time,
      daysOfWeek: frequency === "weekly" ? daysOfWeek : null,
      periodKind,
      enabled: true,
    };

    const item = await createSchedule(input);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/schedules] POST failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
