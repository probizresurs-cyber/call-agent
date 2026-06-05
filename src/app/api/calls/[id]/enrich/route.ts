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

  if (row.bitrix_deal_id) {
    const d = await crmDealGet(row.bitrix_deal_id);
    dealTitle = d?.TITLE ?? null;
  }
  if (row.bitrix_lead_id) {
    const l = await crmLeadGet(row.bitrix_lead_id);
    leadTitle = l
      ? (l.TITLE || [l.NAME, l.LAST_NAME].filter(Boolean).join(" ") || null)
      : null;
  }
  if (row.bitrix_contact_id) {
    const c = await crmContactGet(row.bitrix_contact_id);
    if (c) contactName = formatContactName(c);
  }

  await db
    .prepare(
      `UPDATE calls
       SET bitrix_deal_title = ?, bitrix_lead_title = ?, bitrix_contact_name = ?, bitrix_portal_url = ?
       WHERE id = ? AND tenant_id = ?`
    )
    .run(dealTitle, leadTitle, contactName, portalUrl, callId, me.tenantId);

  return NextResponse.json({
    ok: true,
    updated: { dealTitle, leadTitle, contactName, portalUrl },
  });
}
