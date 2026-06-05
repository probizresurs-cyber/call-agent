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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(_req: NextRequest) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden — owner/admin only" }, { status: 403 });
  }

  const db = getDbAsync();

  const rows = await db
    .prepare(
      `SELECT id, bitrix_deal_id, bitrix_lead_id, bitrix_contact_id
       FROM calls
       WHERE tenant_id = ?
         AND (bitrix_deal_id IS NOT NULL OR bitrix_lead_id IS NOT NULL OR bitrix_contact_id IS NOT NULL)
         AND (bitrix_deal_title IS NULL AND bitrix_lead_title IS NULL AND bitrix_portal_url IS NULL)
       LIMIT 200`
    )
    .all<{
      id: number;
      bitrix_deal_id: string | null;
      bitrix_lead_id: string | null;
      bitrix_contact_id: string | null;
    }>(me.tenantId);

  const portalUrl = getBitrixPortalUrl();
  let processed = 0;
  let errors = 0;

  for (const row of rows) {
    try {
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
        .run(dealTitle, leadTitle, contactName, portalUrl, row.id, me.tenantId);

      processed++;
    } catch (e) {
      console.warn(`[bulk-enrich] call ${row.id} failed:`, (e as Error).message);
      errors++;
    }

    // Rate-limit protection: 200ms pause between Bitrix API calls
    if (processed + errors < rows.length) {
      await sleep(200);
    }
  }

  return NextResponse.json({ ok: true, processed, errors });
}
