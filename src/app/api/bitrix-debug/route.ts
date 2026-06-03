/**
 * GET /api/bitrix-debug
 *
 * Диагностический endpoint: возвращает разбивку crm.activity.list по TYPE_ID и
 * PROVIDER_ID за последние 30 дней. Помогает понять что вообще есть в Bitrix
 * и почему импорт email/чатов вернул 0.
 *
 * Доступ: owner / admin / head.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { callBitrixApi } from "@/lib/bitrix";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ActivityShort {
  ID: string;
  TYPE_ID: string;
  PROVIDER_ID: string;
  PROVIDER_TYPE_ID: string;
  SUBJECT: string;
  CREATED: string;
  DIRECTION: string;
}

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (me.role === "manager") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!process.env.BITRIX_WEBHOOK_URL?.trim()) {
    return NextResponse.json({ ok: false, error: "BITRIX_WEBHOOK_URL не задан" }, { status: 400 });
  }

  // Тянем активности за последние 30 дней без фильтра TYPE_ID — посмотрим что есть
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  try {
    const activities = await callBitrixApi<ActivityShort[]>("crm.activity.list", {
      filter: { ">=CREATED": since },
      order: { CREATED: "DESC" },
      select: ["ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID", "SUBJECT", "CREATED", "DIRECTION"],
    });

    // Группировка
    const byType: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    const samples: Record<string, ActivityShort> = {};

    for (const a of activities) {
      const t = a.TYPE_ID || "?";
      const p = a.PROVIDER_ID || "(empty)";
      byType[t] = (byType[t] ?? 0) + 1;
      byProvider[p] = (byProvider[p] ?? 0) + 1;
      const key = `${t}:${p}`;
      if (!samples[key]) samples[key] = a;
    }

    const typeLabels: Record<string, string> = {
      "1": "Встреча (TYPE_ID=1)",
      "2": "Звонок (TYPE_ID=2)",
      "3": "Задача (TYPE_ID=3)",
      "4": "Email (TYPE_ID=4)",
      "5": "Другое (TYPE_ID=5)",
      "6": "Open Lines / прочее (TYPE_ID=6)",
    };

    return NextResponse.json({
      ok: true,
      period: { since, total_activities: activities.length },
      by_type: Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ type_id: id, label: typeLabels[id] || `Unknown (${id})`, count })),
      by_provider: Object.entries(byProvider)
        .sort((a, b) => b[1] - a[1])
        .map(([provider, count]) => ({ provider_id: provider, count })),
      samples: Object.entries(samples).map(([key, a]) => ({
        key,
        id: a.ID,
        subject: a.SUBJECT?.slice(0, 80) || null,
        created: a.CREATED,
        direction: a.DIRECTION,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
