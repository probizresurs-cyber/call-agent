import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { ReprocessButton } from "./ReprocessButton";

export const dynamic = "force-dynamic";

type Call = {
  id: number;
  bitrix_call_id: string | null;
  bitrix_deal_id: string | null;
  bitrix_lead_id: string | null;
  manager_name: string | null;
  manager_id: string | null;
  client_phone: string | null;
  direction: "in" | "out" | null;
  started_at: string | null;
  duration_sec: number;
  status: string;
  recording_path: string | null;
  error: string | null;
};
type Transcript = { text: string; segments_json: string | null; language: string | null; model: string | null };
type Analysis = {
  summary: string | null; sentiment: string | null;
  manager_score: number | null; script_compliance: number | null;
  next_action: string | null;
  objections_json: string | null; topics_json: string | null;
  model: string | null;
};

export default async function CallDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await props.params;
  const id = parseInt(idStr, 10);
  const db = getDb();
  const call = db.prepare(`SELECT * FROM calls WHERE id = ?`).get(id) as Call | undefined;
  if (!call) notFound();

  const transcript = db.prepare(`SELECT * FROM transcripts WHERE call_id = ?`).get(id) as Transcript | undefined;
  const analysis = db.prepare(`SELECT * FROM analyses WHERE call_id = ?`).get(id) as Analysis | undefined;

  const objections: string[] = analysis?.objections_json ? JSON.parse(analysis.objections_json) : [];
  const topics: string[] = analysis?.topics_json ? JSON.parse(analysis.topics_json) : [];

  return (
    <>
      <Link href="/calls" className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>← К списку</Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 20px" }}>
        <h1 className="ds-h1">Звонок #{call.id}</h1>
        <ReprocessButton callId={call.id} />
      </div>

      {call.error && (
        <div className="ds-card" style={{
          background: "rgba(212,67,67,0.08)",
          borderColor: "rgba(212,67,67,0.30)",
          marginBottom: 16,
        }}>
          <b style={{ color: "var(--destructive)" }}>Ошибка обработки:</b> {call.error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12 }}>Информация</h2>
          <Row label="Bitrix call ID" value={call.bitrix_call_id || "—"} />
          <Row label="Дата" value={call.started_at || "—"} />
          <Row label="Менеджер" value={call.manager_name || call.manager_id || "—"} />
          <Row label="Клиент" value={call.client_phone || "—"} />
          <Row label="Направление" value={call.direction === "in" ? "Входящий" : call.direction === "out" ? "Исходящий" : "—"} />
          <Row label="Длительность" value={`${Math.floor(call.duration_sec / 60)}:${String(call.duration_sec % 60).padStart(2, "0")}`} />
          <Row label="Связь с CRM" value={
            call.bitrix_deal_id ? `Сделка #${call.bitrix_deal_id}` :
            call.bitrix_lead_id ? `Лид #${call.bitrix_lead_id}` : "—"
          } />
          <Row label="Статус" value={call.status} />
        </div>

        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12 }}>Запись</h2>
          {call.recording_path ? (
            <audio controls style={{ width: "100%" }} src={`/call-agent/api/recordings/${call.id}`} />
          ) : (
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
              Запись не скачана
            </div>
          )}
        </div>
      </div>

      {analysis && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 14 }}>AI-анализ</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
            <Metric label="Настроение" value={
              analysis.sentiment === "positive" ? "🟢 Позитив" :
              analysis.sentiment === "negative" ? "🔴 Негатив" :
              "🟡 Нейтрально"
            } />
            <Metric label="Оценка менеджера"
              value={analysis.manager_score != null ? `${analysis.manager_score.toFixed(1)} / 10` : "—"} />
            <Metric label="Соблюдение скрипта"
              value={analysis.script_compliance != null ? `${Math.round(analysis.script_compliance * 100)}%` : "—"} />
          </div>

          <Section title="Краткое содержание" body={analysis.summary} />
          <Section title="Следующий шаг" body={analysis.next_action} />

          {objections.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="ds-caption" style={{ marginBottom: 6 }}>Возражения</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {objections.map((o, i) => <li key={i} className="ds-body-sm">{o}</li>)}
              </ul>
            </div>
          )}

          {topics.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="ds-caption" style={{ marginBottom: 6 }}>Темы</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {topics.map((t) => <span key={t} className="ds-badge ds-badge-info">{t}</span>)}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 12 }}>Стенограмма</h2>
        {transcript ? (
          <div style={{
            whiteSpace: "pre-wrap",
            fontSize: 14, lineHeight: 1.65,
            maxHeight: 600, overflowY: "auto",
            padding: 12,
            background: "var(--muted)",
            borderRadius: 6,
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, background: "var(--muted)", borderRadius: 6 }}>
      <div className="ds-caption" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{value}</div>
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
