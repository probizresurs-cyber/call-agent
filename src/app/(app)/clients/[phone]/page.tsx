/**
 * §4.6 MASTER-TZ — профиль клиента 360.
 *
 * URL = нормализованный телефон (digits-only). Один телефон = один профиль.
 *
 * Структура страницы:
 *   1. Шапка: имя, телефон, KPI (касаний, период, настроение)
 *   2. Связанные CRM-сущности (если есть deal/lead/contact)
 *   3. ⚠ Оборванные нити — выделенный блок сверху для РОПа
 *   4. Хронология — лента всех взаимодействий с краткими карточками
 *   5. Менеджеры — кто работал с клиентом
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  User, Phone, MessageSquare, Mail, Video, ArrowDownLeft, ArrowUpRight,
  AlertTriangle, Star, Calendar, Briefcase, UserCheck,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getClientProfile, detectLooseThreads, normalizePhone, type LooseThread, type InteractionTimelineItem } from "@/lib/clients";
import { SentimentBadge } from "@/app/_components/Badges";

export const dynamic = "force-dynamic";

export default async function ClientProfilePage(props: { params: Promise<{ phone: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const { phone: phoneParam } = await props.params;
  const normalized = normalizePhone(decodeURIComponent(phoneParam));
  if (!normalized || normalized.length < 7) notFound();

  const data = await getClientProfile({
    tenantId: me.tenantId,
    normalizedPhone: normalized,
    managerId: me.role === "manager" ? me.bitrixManagerId : undefined,
  });

  if (!data) notFound();
  const { summary, timeline } = data;
  const threads = detectLooseThreads(timeline);

  const sentimentTotal = summary.positive + summary.neutral + summary.negative;

  return (
    <>
      <Link href="/clients" style={{ color: "var(--primary)", fontSize: 13, marginBottom: 12, display: "inline-block" }}>
        ← К списку клиентов
      </Link>

      {/* Шапка */}
      <div className="ds-card" style={{ marginBottom: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 28,
            background: "linear-gradient(135deg, #7c70e0, #5b4fc7)",
            display: "grid", placeItems: "center",
            color: "white", fontSize: 22, fontWeight: 700, flexShrink: 0,
          }}>
            {summary.name ? summary.name.charAt(0).toUpperCase() : <User size={28} />}
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="ds-h1" style={{ marginBottom: 2 }}>
              {summary.name || summary.display_phone || "Без имени"}
            </h1>
            {summary.name && (
              <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 4 }}>
                {summary.display_phone}
              </div>
            )}
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
              <Calendar size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              {summary.first_at ? formatDate(summary.first_at) : "—"} → {summary.last_at ? formatDate(summary.last_at) : "—"}
            </div>
          </div>
        </div>

        {/* KPI карточки */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 20 }}>
          <KpiTile label="Всего касаний" value={String(summary.total_count)} icon={<UserCheck size={14} />} />
          {Object.entries(summary.by_type).map(([type, count]) => (
            <KpiTile
              key={type}
              label={typeLabel(type)}
              value={String(count)}
              icon={typeIcon(type)}
            />
          ))}
        </div>

        {/* Настроение */}
        {sentimentTotal > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="ds-caption" style={{ marginBottom: 6 }}>Настроение по всем касаниям</div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ background: "var(--success)", width: `${(summary.positive / sentimentTotal) * 100}%` }} title={`Позитив: ${summary.positive}`} />
              <div style={{ background: "var(--muted-foreground)", width: `${(summary.neutral / sentimentTotal) * 100}%` }} title={`Нейтрально: ${summary.neutral}`} />
              <div style={{ background: "var(--destructive)", width: `${(summary.negative / sentimentTotal) * 100}%` }} title={`Негатив: ${summary.negative}`} />
            </div>
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 4, fontSize: 11 }}>
              {summary.positive} позитив · {summary.neutral} нейтр · {summary.negative} негатив
            </div>
          </div>
        )}
      </div>

      {/* Связанные CRM */}
      {(summary.deal_ids.length > 0 || summary.lead_ids.length > 0 || summary.contact_ids.length > 0) && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Briefcase size={16} strokeWidth={2} /> Связь с CRM
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {summary.deal_ids.map((id) => <span key={"d" + id} className="ds-badge ds-badge-info">Deal #{id}</span>)}
            {summary.lead_ids.map((id) => <span key={"l" + id} className="ds-badge ds-badge-info">Lead #{id}</span>)}
            {summary.contact_ids.map((id) => <span key={"c" + id} className="ds-badge ds-badge-info">Contact #{id}</span>)}
          </div>
        </div>
      )}

      {/* ⚠ Оборванные нити */}
      {threads.length > 0 && (
        <div className="ds-card" style={{
          marginBottom: 16,
          background: "rgba(245, 158, 11, 0.06)",
          border: "1px solid rgba(245, 158, 11, 0.30)",
        }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, color: "var(--warning)" }}>
            <AlertTriangle size={16} strokeWidth={2} /> Оборванные нити ({threads.length})
          </h2>
          <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 12, fontSize: 12 }}>
            Потенциально упущенные обещания и не закрытые шаги. Эвристики простые — не пытайтесь
            на них опираться как на жёсткое правило, но это удобный список для разбора с менеджером.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {threads.map((t, i) => <LooseThreadRow key={i} t={t} />)}
          </ul>
        </div>
      )}

      {/* Менеджеры */}
      {summary.managers.length > 0 && summary.managers.length <= 5 && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <UserCheck size={16} strokeWidth={2} /> Менеджеры
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {summary.managers.map((m) => (
              <span key={m.id ?? m.name ?? "_"} className="ds-badge" style={{ background: "var(--muted)", padding: "4px 10px" }}>
                {m.name || `ID ${m.id || "?"}`} · {m.count} {m.count === 1 ? "касание" : m.count < 5 ? "касания" : "касаний"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Хронология */}
      <div className="ds-card">
        <h2 className="ds-h3" style={{ marginBottom: 14 }}>Хронология ({timeline.length})</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {timeline.map((it, i) => <TimelineItem key={it.id} it={it} last={i === timeline.length - 1} />)}
        </div>
      </div>
    </>
  );
}

// ── Subcomponents ──

function KpiTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div style={{
      padding: 10,
      background: "var(--muted)",
      borderRadius: 6,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={{ color: "var(--muted-foreground)" }}>{icon}</div>
      <div>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function LooseThreadRow({ t }: { t: LooseThread }) {
  const kindColor = {
    no_next_action:        "var(--warning)",
    promise_overdue:       "var(--destructive)",
    negative_unfollowed:   "var(--destructive)",
    long_silence:          "var(--muted-foreground)",
  }[t.kind];
  const kindLabel = {
    no_next_action:        "Нет следующего шага",
    promise_overdue:       "Просроченное обещание",
    negative_unfollowed:   "Негатив без работы",
    long_silence:          "Долгое молчание",
  }[t.kind];

  return (
    <li style={{ display: "flex", gap: 10, padding: 8, background: "var(--background)", borderRadius: 4 }}>
      <Link href={`/calls/${t.callId}`} style={{ color: "var(--primary)", flexShrink: 0, fontWeight: 600, fontSize: 14 }}>
        #{t.callId}
      </Link>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: kindColor, marginBottom: 4 }}>{kindLabel}</div>
        <div style={{ color: "var(--foreground)", fontSize: 14, lineHeight: 1.5 }}>{t.description}</div>
      </div>
    </li>
  );
}

function TimelineItem({ it, last }: { it: InteractionTimelineItem; last: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, paddingBottom: last ? 0 : 16, paddingTop: 4, position: "relative" }}>
      {/* Вертикальная линия */}
      {!last && (
        <div style={{ position: "absolute", left: 13, top: 32, bottom: 0, width: 1, background: "var(--border)" }} />
      )}
      {/* Иконка типа */}
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 14,
        background: typeBgColor(it.interaction_type),
        display: "grid", placeItems: "center", color: "white",
      }}>
        {typeIcon(it.interaction_type)}
      </div>

      {/* Контент */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted-foreground)" }}>
          <span>{formatDateTime(it.started_at)}</span>
          <span>·</span>
          <span>{typeLabel(it.interaction_type)}</span>
          {it.direction && (
            <span>·{it.direction === "in"
              ? <ArrowDownLeft size={11} style={{ verticalAlign: -1, marginLeft: 2 }} color="var(--success)" />
              : <ArrowUpRight size={11} style={{ verticalAlign: -1, marginLeft: 2 }} color="var(--primary)" />}
            </span>
          )}
          {it.manager_name && <><span>·</span><span>{it.manager_name}</span></>}
          {it.duration_sec > 0 && <><span>·</span><span>{formatDur(it.duration_sec)}</span></>}
        </div>

        <div style={{ marginTop: 4, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <Link href={`/calls/${it.id}`} style={{ color: "var(--primary)", fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
            #{it.id}
          </Link>
          <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5 }}>
            {it.summary || <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>{it.status === "done" ? "Анализ без summary" : it.status}</span>}
            {it.next_action && (
              <div style={{ color: "var(--muted-foreground)", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                <b style={{ color: "var(--primary)" }}>След. шаг:</b> {it.next_action}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            {it.sentiment && <SentimentBadge value={it.sentiment} />}
            {it.manager_score != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, color: "var(--warning)" }}>
                <Star size={11} fill="currentColor" />
                {it.manager_score.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──

function typeIcon(t: string): React.ReactNode {
  if (t === "chat")    return <MessageSquare size={14} strokeWidth={2} />;
  if (t === "email")   return <Mail size={14} strokeWidth={2} />;
  if (t === "meeting") return <Video size={14} strokeWidth={2} />;
  return <Phone size={14} strokeWidth={2} />;
}

function typeBgColor(t: string): string {
  if (t === "chat")    return "var(--success)";
  if (t === "email")   return "var(--primary)";
  if (t === "meeting") return "var(--warning)";
  return "var(--muted-foreground)";
}

function typeLabel(t: string): string {
  return ({ call: "Звонок", chat: "Чат", email: "Email", meeting: "Встреча" } as Record<string, string>)[t] || t;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(s: string | null): string {
  if (!s) return "—";
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function formatDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}с`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
