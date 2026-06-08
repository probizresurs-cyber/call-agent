/**
 * POST /api/reports/send
 *
 * Генерирует отчёт и отправляет его в Bitrix-мессенджер.
 *
 * Body: { scope: "manager"|"team", managerId?, recipientId?, from?, to?, periodLabel? }
 * Доступ: owner / admin / head (canViewTeam).
 *
 *  - recipientId (опц.): явный получатель (Bitrix user id). Если задан — отчёт уходит
 *    ТОЛЬКО ему, независимо от scope. Так можно отправить отчёт про менеджера — РОПу.
 *  - scope='manager': managerId — это Bitrix user id менеджера (про кого отчёт). Без
 *    recipientId отчёт уходит самому менеджеру. Если managerId пустой — ошибка.
 *  - scope='team': без recipientId шлём всем РОПам / владельцам тенанта (users role
 *    owner/admin/head с непустым bitrix_manager_id). Если таких нет, но у текущего
 *    пользователя есть bitrix id — шлём ему.
 *
 * generateReport() и imSendMessage() реализует параллельный агент.
 */
import { NextResponse } from "next/server";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { generateReport, type ReportOpts } from "@/lib/reports";
import { imSendMessage, type ImSendResult } from "@/lib/bitrix-im";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SendResultRow {
  recipient: string;        // bitrix user id
  recipientName?: string;   // ФИО, если известно
  ok: boolean;
  mode?: "live" | "dry";
  messageId?: number;
  error?: string;
}

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canViewTeam(me.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    scope?: unknown;
    managerId?: unknown;
    recipientId?: unknown;
    from?: unknown;
    to?: unknown;
    periodLabel?: unknown;
  };

  const scope = body.scope === "team" ? "team" : "manager";
  const managerId = typeof body.managerId === "string" && body.managerId.trim()
    ? body.managerId.trim()
    : undefined;
  // «Кому отправить» — явный получатель (Bitrix user id). Если задан — шлём ему,
  // независимо от scope (отчёт про кого ≠ кому отправить).
  const recipientId = typeof body.recipientId === "string" && body.recipientId.trim()
    ? body.recipientId.trim()
    : undefined;

  if (scope === "manager" && !managerId) {
    return NextResponse.json(
      { ok: false, error: "Для отчёта по менеджеру нужно выбрать менеджера" },
      { status: 400 }
    );
  }

  const opts: ReportOpts = {
    tenantId: me.tenantId,
    scope,
    managerId,
    from: typeof body.from === "string" && body.from ? body.from : undefined,
    to: typeof body.to === "string" && body.to ? body.to : undefined,
    periodLabel: typeof body.periodLabel === "string" && body.periodLabel ? body.periodLabel : undefined,
  };

  // ── Собираем список получателей (bitrix user id + имя) ДО генерации,
  //    чтобы при пустом списке не тратить токены на отчёт.
  let recipients: Array<{ bitrixId: string; name?: string }> = [];

  if (recipientId) {
    // Явно выбран получатель — отправляем только ему, независимо от scope.
    // Имя подтягиваем best-effort (users по bitrix-привязке → managers-кэш).
    let name: string | undefined;
    try {
      const db = getDbAsync();
      const urow = await db
        .prepare(
          `SELECT COALESCE(NULLIF(name, ''), login) AS name
             FROM users WHERE tenant_id = ? AND bitrix_manager_id = ? LIMIT 1`
        )
        .get<{ name: string }>(me.tenantId, recipientId);
      if (urow?.name) name = urow.name;
      else {
        const mrow = await db
          .prepare(`SELECT name FROM managers WHERE id = ? LIMIT 1`)
          .get<{ name: string }>(recipientId);
        if (mrow?.name) name = mrow.name;
      }
    } catch { /* имя необязательно — UI покажет Bitrix ID */ }
    recipients = [{ bitrixId: recipientId, name }];
  } else if (scope === "manager") {
    // managerId здесь — это и есть Bitrix user id менеджера.
    recipients = [{ bitrixId: managerId! }];
  } else {
    const db = getDbAsync();
    const rows = await db
      .prepare(
        `SELECT bitrix_manager_id AS bid, name
           FROM users
          WHERE tenant_id = ?
            AND role IN ('owner','admin','head')
            AND bitrix_manager_id IS NOT NULL
            AND bitrix_manager_id != ''`
      )
      .all<{ bid: string; name: string | null }>(me.tenantId);

    recipients = rows.map((r) => ({ bitrixId: String(r.bid), name: r.name ?? undefined }));

    // Fallback: ни у кого из РОПов/владельцев нет bitrix id — шлём текущему,
    // если у него самого есть привязка.
    if (recipients.length === 0 && me.bitrixManagerId) {
      recipients = [{ bitrixId: me.bitrixManagerId, name: me.name ?? undefined }];
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          scope === "manager"
            ? "У менеджера не указан Bitrix-аккаунт — некому отправить отчёт"
            : "Нет получателей: ни у одного РОПа/владельца не привязан Bitrix-аккаунт",
      },
      { status: 400 }
    );
  }

  try {
    const report = await generateReport(opts);

    const results: SendResultRow[] = [];
    for (const r of recipients) {
      let res: ImSendResult;
      try {
        res = await imSendMessage(r.bitrixId, report.text, me.tenantId);
      } catch (e) {
        res = { ok: false, mode: "live", error: e instanceof Error ? e.message : String(e) };
      }
      results.push({
        recipient: r.bitrixId,
        recipientName: r.name,
        ok: res.ok,
        mode: res.mode,
        messageId: res.messageId,
        error: res.error,
      });
    }

    const sent = results.filter((r) => r.ok).length;
    const dry = results.some((r) => r.mode === "dry");

    return NextResponse.json({
      ok: sent > 0,
      sent,
      total: results.length,
      dry,
      title: report.title,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[reports/send] failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
