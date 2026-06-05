import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft, Star, ClipboardList, User, FileAudio, Info,
  CheckCircle2, XCircle, CircleDot, MessageSquare, Tag,
  Phone, ArrowDownLeft, ArrowUpRight, MinusCircle,
  Briefcase, UserPlus, ExternalLink,
} from "lucide-react";
import { getDbAsync } from "@/lib/db-compat";
import { getSessionUser } from "@/lib/auth";
import { ReprocessButton } from "./ReprocessButton";
import { DeepAnalyzeButton } from "./DeepAnalyzeButton";
import { SendToCrmButton } from "./SendToCrmButton";

export const dynamic = "force-dynamic";

type Call = {
  id: number;
  bitrix_call_id: string | null;
  bitrix_deal_id: string | null;
  bitrix_lead_id: string | null;
  bitrix_contact_id: string | null;
  bitrix_deal_title: string | null;
  bitrix_lead_title: string | null;
  bitrix_contact_name: string | null;
  bitrix_portal_url: string | null;
  manager_name: string | null;
  manager_id: string | null;
  client_phone: string | null;
  direction: "in" | "out" | null;
  started_at: string | null;
  duration_sec: number;
  status: string;
  recording_path: string | null;
  error: string | null;
  deal_context_json: string | null;
  interaction_type: string | null;
  channel: string | null;
  content_text: string | null;
};
type Transcript = {
  text: string;
  segments_json: string | null;
  dialogue_json: string | null;
  language: string | null;
  model: string | null;
};
type Analysis = {
  summary: string | null;
  sentiment: string | null;
  manager_score: number | null;
  script_compliance: number | null;
  next_action: string | null;
  objections_json: string | null;
  topics_json: string | null;
  model: string | null;
  client_name: string | null;
  checklist_scores_json: string | null;
  coaching_tips_json: string | null;
};

type Dialogue = Array<{ speaker: "manager" | "client" | "unknown"; text: string }>;
type ChecklistScore = { id: string; title: string; score: number; notes: string; block?: string };

export default async function CallDetailPage(props: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const { id: idStr } = await props.params;
  const id = parseInt(idStr, 10);
  const db = getDbAsync();
  const call = await db.prepare(
    `SELECT * FROM calls WHERE id = ? AND tenant_id = ?`
  ).get<Call>(id, me.tenantId);
  if (!call) notFound();

  // RLS для менеджера — нельзя смотреть чужой звонок по прямой ссылке
  if (me.role === "manager") {
    if (!me.bitrixManagerId || call.manager_id !== me.bitrixManagerId) {
      notFound();
    }
  }

  const transcript = await db.prepare(`SELECT * FROM transcripts WHERE call_id = ?`).get<Transcript>(id);
  const analysis = await db.prepare(`SELECT * FROM analyses WHERE call_id = ?`).get<Analysis>(id);

  const objections: string[] = analysis?.objections_json ? JSON.parse(analysis.objections_json) : [];
  const topics: string[] = analysis?.topics_json ? JSON.parse(analysis.topics_json) : [];
  const checklistScores: ChecklistScore[] = analysis?.checklist_scores_json
    ? JSON.parse(analysis.checklist_scores_json) : [];
  const coachingTips: string[] = analysis?.coaching_tips_json
    ? JSON.parse(analysis.coaching_tips_json) : [];
  const dialogue: Dialogue = transcript?.dialogue_json ? JSON.parse(transcript.dialogue_json) : [];

  return (
    <>
      <Link href="/calls" className="ds-body-sm" style={{
        color: "var(--muted-foreground)", display: "inline-flex", alignItems: "center", gap: 4,
      }}>
        <ArrowLeft size={14} /> К списку
      </Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 20px" }}>
        <h1 className="ds-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          Звонок #{call.id}
          {analysis?.client_name && (
            <span style={{
              fontSize: 16, color: "var(--muted-foreground)",
              fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <User size={16} strokeWidth={2} />
              с {analysis.client_name}
            </span>
          )}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {me.role !== "manager" && <DeepAnalyzeButton callId={call.id} />}
          <ReprocessButton callId={call.id} />
        </div>
      </div>

      {call.error && (
        <div className="ds-card" style={{
          background: "rgba(212,67,67,0.08)", borderColor: "rgba(212,67,67,0.30)", marginBottom: 16,
        }}>
          <b style={{ color: "var(--destructive)" }}>Ошибка обработки:</b> {call.error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Info size={16} strokeWidth={2} /> Информация
          </h2>
          <Row label="Тип" value={typeLabel(call.interaction_type, call.channel)} />
          <Row label="ID источника" value={call.bitrix_call_id || "—"} />
          <Row label="Дата" value={formatDate(call.started_at)} />
          <Row label="Менеджер" value={call.manager_name || call.manager_id || "—"} />
          <Row label="Заказчик" value={
            call.client_phone ? (
              <Link href={`/clients/${call.client_phone.replace(/\D/g, "").replace(/^8/, "7")}`} style={{ color: "var(--primary)" }}>
                {call.client_phone} →
              </Link>
            ) : "—"
          } />
          <Row label="Имя заказчика (из разговора)" value={analysis?.client_name || "—"} />
          <Row
            label="Направление"
            value={
              call.direction === "in"
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <ArrowDownLeft size={13} color="var(--success)" /> Входящий
                  </span>
                : call.direction === "out"
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <ArrowUpRight size={13} color="var(--primary)" /> Исходящий
                  </span>
                : "—"
            }
          />
          <Row label="Длительность" value={`${Math.floor(call.duration_sec / 60)}:${String(call.duration_sec % 60).padStart(2, "0")}`} />
          <Row label="Статус" value={call.status} />
        </div>

        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <FileAudio size={16} strokeWidth={2} /> Запись
          </h2>
          {call.recording_path ? (
            <audio controls style={{ width: "100%" }} src={`/call-agent/api/recordings/${call.id}`} />
          ) : (
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
              Запись не скачана
            </div>
          )}
        </div>
      </div>

      {/* CRM-блок: ссылки на карточки Bitrix24 (сделка/лид/контакт) */}
      {(call.bitrix_deal_id || call.bitrix_lead_id || call.bitrix_contact_id) && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Briefcase size={16} strokeWidth={2} /> CRM
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {call.bitrix_deal_id && (
              <CrmLink
                icon={<Briefcase size={14} color="var(--primary)" />}
                kindLabel="Сделка"
                id={call.bitrix_deal_id}
                title={call.bitrix_deal_title}
                portalUrl={call.bitrix_portal_url}
                path={`crm/deal/details/${call.bitrix_deal_id}/`}
              />
            )}
            {call.bitrix_lead_id && (
              <CrmLink
                icon={<UserPlus size={14} color="var(--primary)" />}
                kindLabel="Лид"
                id={call.bitrix_lead_id}
                title={call.bitrix_lead_title}
                portalUrl={call.bitrix_portal_url}
                path={`crm/lead/details/${call.bitrix_lead_id}/`}
              />
            )}
            {call.bitrix_contact_id && (
              <CrmLink
                icon={<User size={14} color="var(--primary)" />}
                kindLabel="Контакт"
                id={call.bitrix_contact_id}
                title={call.bitrix_contact_name}
                portalUrl={call.bitrix_portal_url}
                path={`crm/contact/details/${call.bitrix_contact_id}/`}
              />
            )}
          </div>
        </div>
      )}

      {analysis && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 14 }}>AI-анализ</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
            <Metric
              label="Настроение"
              icon={
                analysis.sentiment === "positive" ? <CheckCircle2 size={18} color="var(--success)" /> :
                analysis.sentiment === "negative" ? <XCircle size={18} color="var(--destructive)" /> :
                <CircleDot size={18} color="var(--muted-foreground)" />
              }
              value={
                analysis.sentiment === "positive" ? "Позитив" :
                analysis.sentiment === "negative" ? "Негатив" : "Нейтральное"
              }
            />
            <Metric
              icon={<Star size={18} color="var(--warning)" />}
              label="Оценка менеджера"
              value={analysis.manager_score != null ? `${analysis.manager_score.toFixed(1)} / 10` : "—"}
            />
            <Metric
              icon={<ClipboardList size={18} color="var(--primary)" />}
              label="Чек-лист QC"
              value={analysis.script_compliance != null ? `${Math.round(analysis.script_compliance * 100)}%` : "—"}
            />
          </div>

          <Section title="Краткое содержание" body={analysis.summary} />
          <Section title="Следующий шаг" body={analysis.next_action} />

          {/* §5.2 MASTER-TZ: советы менеджеру — доброжелательный коучинг, не упрёк */}
          {coachingTips.length > 0 && (
            <div style={{
              marginTop: 14, padding: 12,
              background: "rgba(96, 165, 250, 0.06)",
              border: "1px solid rgba(96, 165, 250, 0.20)",
              borderRadius: 8,
            }}>
              <div className="ds-caption" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--primary)" }}>
                <CircleDot size={12} /> Что попробовать в следующий раз
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {coachingTips.map((tip, i) => (
                  <li key={i} className="ds-body-sm" style={{ lineHeight: 1.5 }}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {objections.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="ds-caption" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <MessageSquare size={12} /> Возражения
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {objections.map((o, i) => <li key={i} className="ds-body-sm">{o}</li>)}
              </ul>
            </div>
          )}

          {topics.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="ds-caption" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Tag size={12} /> Темы
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {topics.map((t) => <span key={t} className="ds-badge ds-badge-info">{t}</span>)}
              </div>
            </div>
          )}

          {/* §5.5 MASTER-TZ: CRM-write (только head/owner/admin). По умолчанию под DRY_RUN. */}
          {me.role !== "manager" && (
            <SendToCrmButton callId={call.id} />
          )}
        </div>
      )}

      {checklistScores.length > 0 && (
        <div className="ds-card" style={{ marginBottom: 16, padding: 14 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 10, gap: 8,
          }}>
            <h2 className="ds-h3" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <ClipboardList size={16} strokeWidth={2} /> Чек-лист
              <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>
                · {checklistScores.length} пунктов
              </span>
            </h2>
            {(() => {
              const total = checklistScores.reduce((s, x) => s + (x.score || 0), 0);
              const pct = Math.round((total / checklistScores.length) * 100);
              const color = pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--destructive)";
              return <span style={{ color, fontSize: 13, fontWeight: 600 }}>Итог {pct}%</span>;
            })()}
          </div>
          {(() => {
            // Группируем по блокам с сохранением порядка
            const blocks: { name: string; items: ChecklistScore[] }[] = [];
            for (const c of checklistScores) {
              const blockName = (c.block || "").trim() || "Без блока";
              let blk = blocks.find((b) => b.name === blockName);
              if (!blk) { blk = { name: blockName, items: [] }; blocks.push(blk); }
              blk.items.push(c);
            }
            return blocks.map((blk) => {
              const avgScore = blk.items.reduce((s, x) => s + (x.score || 0), 0) / blk.items.length;
              const pct = Math.round(avgScore * 100);
              const blockColor = pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--destructive)";
              return (
                <details key={blk.name} open style={{ marginBottom: 6 }}>
                  <summary style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "4px 8px", background: "var(--muted)", borderRadius: 4,
                    fontWeight: 600, fontSize: 12, cursor: "pointer",
                    listStyle: "none", userSelect: "none",
                  }}>
                    <span>{blk.name} <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>· {blk.items.length}</span></span>
                    <span style={{ color: blockColor, fontSize: 12 }}>{pct}%</span>
                  </summary>
                  <div style={{ marginTop: 2 }}>
                    {blk.items.map((c) => {
                      const itemPct = Math.round(Math.max(0, Math.min(1, c.score)) * 100);
                      const status: "ok" | "partial" | "fail" =
                        itemPct >= 80 ? "ok" : itemPct >= 40 ? "partial" : "fail";
                      const statusIcon =
                        status === "ok"      ? <CheckCircle2 size={14} color="var(--success)" /> :
                        status === "partial" ? <MinusCircle  size={14} color="var(--warning)" /> :
                                               <XCircle      size={14} color="var(--destructive)" />;
                      const itemColor =
                        status === "ok"      ? "var(--success)" :
                        status === "partial" ? "var(--warning)" : "var(--destructive)";
                      const hasNotes = !!(c.notes && c.notes.trim() && c.notes !== "—");
                      return (
                        <details key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                          <summary style={{
                            display: "grid",
                            gridTemplateColumns: "16px 1fr 42px",
                            alignItems: "center", gap: 8,
                            padding: "4px 8px", fontSize: 13,
                            cursor: hasNotes ? "pointer" : "default",
                            listStyle: "none",
                          }}>
                            {statusIcon}
                            <span style={{
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }} title={c.title}>
                              {c.title}
                              {hasNotes && (
                                <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginLeft: 4 }}>·</span>
                              )}
                            </span>
                            <span style={{
                              fontSize: 12, fontWeight: 600, textAlign: "right", color: itemColor,
                            }}>{itemPct}%</span>
                          </summary>
                          {hasNotes && (
                            <div className="ds-body-sm" style={{
                              padding: "4px 8px 8px 32px",
                              color: "var(--muted-foreground)",
                              lineHeight: 1.45,
                            }}>
                              {c.notes}
                            </div>
                          )}
                        </details>
                      );
                    })}
                  </div>
                </details>
              );
            });
          })()}
        </div>
      )}

      {dialogue.length > 0 && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={16} strokeWidth={2} /> Диалог
          </h2>
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 10 }}>
            Псевдо-диаризация — реплики размечены AI по косвенным признакам, точность не 100%.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dialogue.map((turn, i) => {
              const isManager = turn.speaker === "manager";
              const isClient = turn.speaker === "client";
              return (
                <div key={i} style={{
                  display: "flex",
                  justifyContent: isClient ? "flex-end" : "flex-start",
                }}>
                  <div style={{
                    maxWidth: "75%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: isManager ? "var(--accent)" : isClient ? "rgba(31,157,85,0.12)" : "var(--muted)",
                    border: "1px solid var(--border)",
                  }}>
                    <div className="ds-caption" style={{ marginBottom: 4 }}>
                      {isManager ? "Менеджер" : isClient ? "Заказчик" : "?"}
                    </div>
                    <div className="ds-body-sm" style={{ whiteSpace: "pre-wrap" }}>{turn.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Phone size={16} strokeWidth={2} /> Полная стенограмма
        </h2>
        {transcript ? (
          <div style={{
            whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.65,
            maxHeight: 480, overflowY: "auto",
            padding: 12, background: "var(--muted)", borderRadius: 6,
          }}>
            {transcript.text}
          </div>
        ) : (
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            Транскрипт ещё не готов
          </div>
        )}
      </div>
    </>
  );
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  // SQLite: "2026-06-02 12:34:56"; PG: "2026-06-02 12:34:56+00" — нормализуем для JS Date.
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function typeLabel(t: string | null, ch: string | null): string {
  const types: Record<string, string> = {
    call: "Звонок", chat: "Чат", email: "Email", meeting: "Встреча",
  };
  const channels: Record<string, string> = {
    bitrix_telephony: "Bitrix24 АТС",
    openlines: "Bitrix Open Lines",
    whatsapp: "WhatsApp", telegram: "Telegram", email_imap: "Email",
    zoom: "Zoom", yandex_telemost: "Яндекс Телемост",
    manual: "ручная загрузка", other: "другое",
  };
  const tLabel = types[t || "call"] || (t || "—");
  const cLabel = ch ? ` · ${channels[ch] || ch}` : "";
  return tLabel + cLabel;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ padding: 12, background: "var(--muted)", borderRadius: 6 }}>
      <div className="ds-caption" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 18 }}>
        {icon}{value}
      </div>
    </div>
  );
}
function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="ds-caption" style={{ marginBottom: 4 }}>{title}</div>
      <div className="ds-body">{body}</div>
    </div>
  );
}
function ScoreBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = pct >= 80 ? "#1f9d55" : pct >= 40 ? "#d97706" : "#d44343";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--muted)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 32, textAlign: "right" }}>{Math.round(pct)}%</span>
    </div>
  );
}

/**
 * Строка CRM-блока: иконка + тип + название/ID + ссылка «открыть в Bitrix».
 * Если portalUrl null — рендерим только текст без ссылки (webhook URL не задан).
 */
function CrmLink({
  icon, kindLabel, id, title, portalUrl, path,
}: {
  icon: React.ReactNode;
  kindLabel: string;
  id: string;
  title: string | null;
  portalUrl: string | null;
  path: string;
}) {
  const href = portalUrl ? `${portalUrl}/${path}` : null;
  const displayTitle = (title && title.trim()) || `#${id}`;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "8px 10px", background: "var(--muted)", borderRadius: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {icon}
        <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>{kindLabel}:</span>
        <span style={{
          fontWeight: 500, fontSize: 14, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {displayTitle}
        </span>
        {title && (
          <span className="ds-caption" style={{ color: "var(--muted-foreground)" }}>#{id}</span>
        )}
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="ds-body-sm"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            color: "var(--primary)", whiteSpace: "nowrap",
          }}
        >
          Открыть в Bitrix <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
