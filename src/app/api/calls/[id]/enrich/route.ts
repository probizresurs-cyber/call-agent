import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canManage } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import {
  getBitrixPortalUrl,
  crmDealGet,
  crmLeadGet,
  crmContactGet,
  formatContactName,
} from "@/lib/bitrix";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(me.role) && me.role !== "head") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await params;
  const callId = parseInt(idStr, 10);
  if (isNaN(callId)) {
    return NextResponse.json({ ok: false, error: "Invalid call id" }, { status: 400 });
  }

  const db = getDbAsync();
  const row = await db
    .prepare(
      `SELECT bitrix_deal_id, bitrix_lead_id, bitrix_contact_id, tenant_id
       FROM calls WHERE id = ? AND tenant_id = ?`
    )
    .get<{
      bitrix_deal_id: string | null;
      bitrix_lead_id: string | null;
      bitrix_contact_id: string | null;
      tenant_id: number;
    }>(callId, me.tenantId);

  if (!row) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const portalUrl = getBitrixPortalUrl();
  let dealTitle: string | null = null;
  let leadTitle: string | null = null;
  let contactName: string | null = null;
  const errors: string[] = [];

  // Каждый вызов Bitrix в отдельном try/catch — ошибка одного не роняет всё
  if (row.bitrix_deal_id) {
    try {
      const d = await crmDealGet(row.bitrix_deal_id);
      dealTitle = d?.TITLE ?? null;
    } catch (e) {
      errors.push(`deal: ${(e as Error).message}`);
    }
  }
  if (row.bitrix_lead_id) {
    try {
      const l = await crmLeadGet(row.bitrix_lead_id);
      leadTitle = l
        ? (l.TITLE || [l.NAME, l.LAST_NAME].filter(Boolean).join(" ") || null)
        : null;
    } catch (e) {
      errors.push(`lead: ${(e as Error).message}`);
    }
  }
  if (row.bitrix_contact_id) {
    try {
      const c = await crmContactGet(row.bitrix_contact_id);
      if (c) contactName = formatContactName(c);
    } catch (e) {
      errors.push(`contact: ${(e as Error).message}`);
    }
  }

  await db
    .prepare(
      `UPDATE calls
       SET bitrix_deal_title = ?, bitrix_lead_title = ?, bitrix_contact_name = ?, bitrix_portal_url = ?
       WHERE id = ? AND tenant_id = ?`
    )
    .run(dealTitle, leadTitle, contactName, portalUrl, callId, me.tenantId);

  return NextResponse.json({
    ok: errors.length === 0,
    updated: { dealTitle, leadTitle, contactName, portalUrl },
    errors: errors.length > 0 ? errors : undefined,
  });
}
