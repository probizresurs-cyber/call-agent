import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, canManage } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { analyzeCall } from "@/lib/analyzer";
import type { ChecklistItem } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

interface CallRow {
  id: number;
  tenant_id: number;
  transcript_text?: string | null;
  interaction_type: string | null;
  deal_context_json: string | null;
  detected_product: string | null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Auth check
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManage(me.role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { id: idStr } = await ctx.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }

  // Parse optional body
  let modelOverride: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.model && typeof body.model === "string") {
      modelOverride = body.model;
    }
  } catch {
    // No body — use default
  }

  // Default model
  if (!modelOverride) {
    modelOverride = "anthropic:claude-sonnet-4-6";
  }

  const db = getDbAsync();

  // Load call with tenant check
  const call = await db
    .prepare(`SELECT * FROM calls WHERE id = ? AND tenant_id = ?`)
    .get<CallRow>(id, me.tenantId);
  if (!call) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // Load transcript
  const transcript = await db
    .prepare(`SELECT text FROM transcripts WHERE call_id = ?`)
    .get<{ text: string }>(id);
  if (!transcript?.text) {
    return NextResponse.json({ ok: false, error: "Транскрипт не найден — сначала обработайте звонок" }, { status: 422 });
  }

  // Load active checklist for detected product (best-effort)
  let checklist: ChecklistItem[] | null = null;
  try {
    if (call.detected_product) {
      const script = await db
        .prepare(
          `SELECT checklist_json FROM sales_scripts
           WHERE tenant_id = ? AND is_active = 1 AND (product = ? OR product IS NULL)
           ORDER BY CASE WHEN product = ? THEN 0 ELSE 1 END, id DESC LIMIT 1`
        )
        .get<{ checklist_json: string | null }>(me.tenantId, call.detected_product, call.detected_product);
      if (script?.checklist_json) {
        checklist = JSON.parse(script.checklist_json);
      }
    } else {
      const script = await db
        .prepare(
          `SELECT checklist_json FROM sales_scripts WHERE tenant_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1`
        )
        .get<{ checklist_json: string | null }>(me.tenantId);
      if (script?.checklist_json) {
        checklist = JSON.parse(script.checklist_json);
      }
    }
  } catch {
    // Non-fatal — run without checklist
  }

  // Load deal context
  let context = null;
  if (call.deal_context_json) {
    try { context = JSON.parse(call.deal_context_json); } catch {}
  }

  const interactionType = (call.interaction_type ?? "call") as "call" | "chat" | "email" | "meeting";

  try {
    const { analysis, raw, model } = await analyzeCall({
      transcript: transcript.text,
      checklist,
      context,
      tenantId: me.tenantId,
      callId: id,
      interactionType,
      modelOverride,
    });

    // Upsert analysis
    await db.prepare(
      `INSERT INTO analyses (call_id, summary, sentiment, manager_score, script_compliance,
         next_action, objections_json, topics_json, raw_json, model,
         client_name, checklist_scores_json, coaching_tips_json, call_stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(call_id) DO UPDATE SET
         summary=excluded.summary, sentiment=excluded.sentiment,
         manager_score=excluded.manager_score, script_compliance=excluded.script_compliance,
         next_action=excluded.next_action, objections_json=excluded.objections_json,
         topics_json=excluded.topics_json, raw_json=excluded.raw_json, model=excluded.model,
         client_name=excluded.client_name, checklist_scores_json=excluded.checklist_scores_json,
         coaching_tips_json=excluded.coaching_tips_json,
         call_stage=excluded.call_stage,
         created_at=datetime('now')`
    ).run(
      id,
      analysis.summary,
      analysis.sentiment,
      analysis.manager_score,
      analysis.checklist_compliance,
      analysis.next_action,
      JSON.stringify(analysis.objections ?? []),
      JSON.stringify(analysis.topics ?? []),
      raw,
      model,
      analysis.client_name ?? null,
      JSON.stringify(analysis.checklist_scores ?? []),
      JSON.stringify(analysis.coaching_tips ?? []),
      analysis.call_stage ?? "cold"
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
