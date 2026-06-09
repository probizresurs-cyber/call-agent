"use client";

import { useState } from "react";
import {
  FileText, Send, Loader2, AlertCircle, CheckCircle2,
  Clock, Plus, Play, Pencil, Trash2, X, CalendarClock, MessageSquare, User as UserIcon,
} from "lucide-react";

// ── Хелперы дат (те же правила, что в DashboardFilters: неделя с понедельника) ──
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function today(): Date {
  return new Date();
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface Preset {
  key: string;
  label: string;
  /** null/null => «За всё время» */
  range: () => { from: string | null; to: string | null };
}

const PRESETS: Preset[] = [
  { key: "today", label: "Сегодня", range: () => { const t = isoDate(today()); return { from: t, to: t }; } },
  { key: "yesterday", label: "Вчера", range: () => { const d = today(); d.setDate(d.getDate() - 1); const s = isoDate(d); return { from: s, to: s }; } },
  { key: "this_week", label: "Эта неделя", range: () => ({ from: isoDate(startOfWeek(today())), to: isoDate(today()) }) },
  {
    key: "last_week", label: "Прошлая неделя",
    range: () => {
      const start = startOfWeek(today());
      const lastEnd = new Date(start); lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfWeek(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    },
  },
  { key: "this_month", label: "Этот месяц", range: () => ({ from: isoDate(startOfMonth(today())), to: isoDate(today()) }) },
  {
    key: "last_month", label: "Прошлый месяц",
    range: () => {
      const s = startOfMonth(today());
      const lastEnd = new Date(s); lastEnd.setDate(lastEnd.getDate() - 1);
      const lastStart = startOfMonth(lastEnd);
      return { from: isoDate(lastStart), to: isoDate(lastEnd) };
    },
  },
  { key: "all", label: "За всё время", range: () => ({ from: null, to: null }) },
];

interface ManagerOption {
  id: string;
  name: string;
}

type Scope = "manager" | "team";

interface SendResultRow {
  recipient: string;
  recipientName?: string;
  ok: boolean;
  mode?: "live" | "dry";
  messageId?: number;
  error?: string;
}

// ── Типы для секции «Расписание автоотправки» ─────────────────────────
type Frequency = "daily" | "weekly";
type PeriodKind =
  | "yesterday" | "today" | "last_7_days" | "last_week" | "this_week" | "last_month";

interface ScheduleRowDTO {
  id: number;
  tenant_id: number;
  name: string;
  scope: Scope;
  manager_id: string | null;
  recipient_kind: "user" | "chat";
  recipient_id: string;
  recipient_name: string | null;
  frequency: Frequency;
  time_hhmm: string;
  days_of_week: string | null;
  period_kind: PeriodKind;
  enabled: boolean | number;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_error: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BotChatDTO {
  id: string;
  title: string;
  type: "chat" | "user";
}

const PERIOD_LABELS: Record<PeriodKind, string> = {
  yesterday: "Вчера",
  today: "Сегодня",
  last_7_days: "Последние 7 дней",
  last_week: "Прошлая неделя",
  this_week: "Эта неделя",
  last_month: "Прошлый месяц",
};
const PERIOD_KINDS: PeriodKind[] = [
  "yesterday", "today", "last_7_days", "last_week", "this_week", "last_month",
];
const WEEK_DAYS: Array<{ id: number; label: string }> = [
  { id: 1, label: "Пн" }, { id: 2, label: "Вт" }, { id: 3, label: "Ср" },
  { id: 4, label: "Чт" }, { id: 5, label: "Пт" }, { id: 6, label: "Сб" },
  { id: 7, label: "Вс" },
];

function safeParseDays(json: string | null): number[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((d: unknown) => typeof d === "number") as number[] : [];
  } catch { return []; }
}

function formatDateRu(iso: string | null): string {
  if (!iso) return "—";
  // pg/sqlite могут вернуть "YYYY-MM-DD HH:MM:SS" — для new Date(...) добавим Z? нет:
  // время хранится в локали воркера (как datetime('now')). Парсим как есть.
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}

function frequencyLabel(s: ScheduleRowDTO): string {
  if (s.frequency === "daily") return `Ежедневно в ${s.time_hhmm}`;
  const days = safeParseDays(s.days_of_week);
  const dayLabels = days.map((d) => WEEK_DAYS.find((x) => x.id === d)?.label ?? "?").join(", ");
  return `Еженедельно: ${dayLabels || "—"} в ${s.time_hhmm}`;
}

export function ReportsClient({
  managers,
  recipients,
  schedules: initialSchedules,
  chats,
}: {
  managers: ManagerOption[];
  recipients: ManagerOption[];
  schedules: ScheduleRowDTO[];
  chats: BotChatDTO[];
}) {
  const [scope, setScope] = useState<Scope>("manager");
  const [managerId, setManagerId] = useState<string>(managers[0]?.id ?? "");
  // «Кому отправить»: "" = по умолчанию (manager → самому менеджеру; team → всем РОПам).
  // Иначе — отправляем выбранному получателю, независимо от того, про кого отчёт.
  const [recipientId, setRecipientId] = useState<string>("");
  const [presetKey, setPresetKey] = useState<string>("this_month");

  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<
    { sent: number; total: number; dry: boolean; results: SendResultRow[] } | null
  >(null);

  const activePreset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];
  const periodLabel = activePreset.label;

  function buildBody() {
    const { from, to } = activePreset.range();
    return {
      scope,
      managerId: scope === "manager" ? managerId : undefined,
      recipientId: recipientId || undefined,
      from: from ?? undefined,
      to: to ?? undefined,
      periodLabel,
    };
  }

  function validate(): string | null {
    if (scope === "manager" && !managerId) {
      return "Выберите менеджера для персонального отчёта";
    }
    return null;
  }

  async function doPreview() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSendInfo(null);
    setPreviewing(true);
    try {
      const res = await fetch("/call-agent/api/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Не удалось сформировать отчёт");
        setPreview(null);
      } else {
        setPreview({ title: data.title, text: data.text });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function doSend() {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSendInfo(null);
    setSending(true);
    try {
      const res = await fetch("/call-agent/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (!res.ok && !data.results) {
        setError(data.error || "Не удалось отправить отчёт");
      } else {
        setSendInfo({
          sent: data.sent ?? 0,
          total: data.total ?? (data.results?.length ?? 0),
          dry: !!data.dry,
          results: data.results ?? [],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSending(false);
    }
  }

  const busy = previewing || sending;

  // ── Состояние секции «Расписание автоотправки» ──────────────────────
  const [schedules, setSchedules] = useState<ScheduleRowDTO[]>(initialSchedules);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // дефолтный recipient — первый владелец/админ/РОП (если есть)
  function defaultRecipientUser(): { id: string; name: string } | null {
    const head = recipients.find((r) => /владелец|админ|РОП/.test(r.name)) ?? recipients[0];
    return head ?? null;
  }

  // ── Поля формы ──
  const [fName, setFName] = useState<string>("Утренний отчёт");
  const [fScope, setFScope] = useState<Scope>("team");
  const [fManagerId, setFManagerId] = useState<string>(managers[0]?.id ?? "");
  /** "user:ID" | "chat:chatN" | "manual" — что выбрано в селекторе получателя. */
  const [fRecipientSel, setFRecipientSel] = useState<string>(() => {
    const r = defaultRecipientUser();
    return r ? `user:${r.id}` : "manual";
  });
  const [fManualChatId, setFManualChatId] = useState<string>("");
  const [fManualValid, setFManualValid] = useState<{ ok: boolean; title?: string; error?: string } | null>(null);
  const [fFrequency, setFFrequency] = useState<Frequency>("daily");
  const [fTime, setFTime] = useState<string>("09:00");
  const [fDays, setFDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [fPeriod, setFPeriod] = useState<PeriodKind>("yesterday");

  function resetForm() {
    setEditingId(null);
    setFName("Утренний отчёт");
    setFScope("team");
    setFManagerId(managers[0]?.id ?? "");
    const r = defaultRecipientUser();
    setFRecipientSel(r ? `user:${r.id}` : "manual");
    setFManualChatId("");
    setFManualValid(null);
    setFFrequency("daily");
    setFTime("09:00");
    setFDays([1, 2, 3, 4, 5]);
    setFPeriod("yesterday");
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
    setScheduleMsg(null);
  }

  function openEdit(s: ScheduleRowDTO) {
    setEditingId(s.id);
    setFName(s.name);
    setFScope(s.scope);
    setFManagerId(s.manager_id ?? managers[0]?.id ?? "");
    if (s.recipient_kind === "user") {
      setFRecipientSel(`user:${s.recipient_id}`);
    } else {
      // если "chatN" есть в списке chats — выбираем из селекта, иначе manual
      const inList = chats.some((c) => c.type === "chat" && c.id === s.recipient_id);
      if (inList) setFRecipientSel(`chat:${s.recipient_id}`);
      else {
        setFRecipientSel("manual");
        setFManualChatId(s.recipient_id);
      }
    }
    setFFrequency(s.frequency);
    setFTime(s.time_hhmm);
    setFDays(safeParseDays(s.days_of_week));
    setFPeriod(s.period_kind);
    setShowForm(true);
    setScheduleMsg(null);
  }

  /** Резолвим выбранный получатель в { kind, id, name }. null если данные не валидны. */
  function resolveRecipient(): { kind: "user" | "chat"; id: string; name: string } | null {
    if (fRecipientSel.startsWith("user:")) {
      const id = fRecipientSel.slice(5);
      const r = recipients.find((x) => x.id === id);
      return { kind: "user", id, name: r?.name ?? `ID ${id}` };
    }
    if (fRecipientSel.startsWith("chat:")) {
      const id = fRecipientSel.slice(5);
      const c = chats.find((x) => x.id === id);
      return { kind: "chat", id, name: c?.title ?? id };
    }
    if (fRecipientSel === "manual") {
      const raw = fManualChatId.trim();
      if (!raw) return null;
      const m = raw.match(/^(?:chat)?(\d+)$/i);
      if (!m) return null;
      return { kind: "chat", id: `chat${m[1]}`, name: fManualValid?.title ?? `Чат ${m[1]}` };
    }
    return null;
  }

  async function validateManualChat() {
    const raw = fManualChatId.trim();
    if (!raw) { setFManualValid({ ok: false, error: "Введите ID чата" }); return; }
    setScheduleBusy(true);
    try {
      const res = await fetch("/call-agent/api/reports/chats/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: raw }),
      });
      const data = await res.json();
      setFManualValid(data);
    } catch (e) {
      setFManualValid({ ok: false, error: e instanceof Error ? e.message : "Ошибка сети" });
    } finally {
      setScheduleBusy(false);
    }
  }

  async function saveSchedule() {
    const recip = resolveRecipient();
    if (!recip) {
      setScheduleMsg({ kind: "err", text: "Укажите получателя (или проверьте ID чата)" });
      return;
    }
    if (fScope === "manager" && !fManagerId) {
      setScheduleMsg({ kind: "err", text: "Выберите менеджера для персонального отчёта" });
      return;
    }
    if (fFrequency === "weekly" && fDays.length === 0) {
      setScheduleMsg({ kind: "err", text: "Выберите хотя бы один день недели" });
      return;
    }
    setScheduleBusy(true);
    setScheduleMsg(null);
    try {
      const payload = {
        name: fName.trim() || "Без названия",
        scope: fScope,
        managerId: fScope === "manager" ? fManagerId : null,
        recipientKind: recip.kind,
        recipientId: recip.id,
        recipientName: recip.name,
        frequency: fFrequency,
        time: fTime,
        daysOfWeek: fFrequency === "weekly" ? fDays : null,
        periodKind: fPeriod,
      };
      const url = editingId
        ? `/call-agent/api/reports/schedules/${editingId}`
        : `/call-agent/api/reports/schedules`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setScheduleMsg({ kind: "err", text: data.error || "Не удалось сохранить" });
        return;
      }
      const item: ScheduleRowDTO = data.item;
      setSchedules((prev) =>
        editingId ? prev.map((s) => (s.id === editingId ? item : s)) : [item, ...prev]
      );
      const next = item.next_run_at ? formatDateRu(item.next_run_at) : "—";
      setScheduleMsg({ kind: "ok", text: `Сохранено. Следующий запуск: ${next}` });
      setShowForm(false);
      resetForm();
    } catch (e) {
      setScheduleMsg({ kind: "err", text: e instanceof Error ? e.message : "Ошибка сети" });
    } finally {
      setScheduleBusy(false);
    }
  }

  async function deleteScheduleById(id: number) {
    if (!confirm("Удалить расписание?")) return;
    setScheduleBusy(true);
    try {
      const res = await fetch(`/call-agent/api/reports/schedules/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setScheduleMsg({ kind: "err", text: data.error || "Не удалось удалить" });
        return;
      }
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setScheduleMsg({ kind: "ok", text: "Удалено" });
    } catch (e) {
      setScheduleMsg({ kind: "err", text: e instanceof Error ? e.message : "Ошибка сети" });
    } finally {
      setScheduleBusy(false);
    }
  }

  async function toggleScheduleEnabled(s: ScheduleRowDTO) {
    setScheduleBusy(true);
    try {
      const res = await fetch(`/call-agent/api/reports/schedules/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setScheduleMsg({ kind: "err", text: data.error || "Не удалось изменить" });
        return;
      }
      setSchedules((prev) => prev.map((x) => (x.id === s.id ? (data.item as ScheduleRowDTO) : x)));
    } catch (e) {
      setScheduleMsg({ kind: "err", text: e instanceof Error ? e.message : "Ошибка сети" });
    } finally {
      setScheduleBusy(false);
    }
  }

  async function runScheduleNow(id: number) {
    setScheduleBusy(true);
    setScheduleMsg(null);
    try {
      const res = await fetch(`/call-agent/api/reports/schedules/${id}/run-now`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        setScheduleMsg({ kind: "ok", text: "Отчёт отправлен в Bitrix" });
      } else {
        setScheduleMsg({ kind: "err", text: `Ошибка: ${data.error || "неизвестно"}` });
      }
      // Перечитаем список — last_run_* обновится
      const listRes = await fetch(`/call-agent/api/reports/schedules`);
      const listData = await listRes.json();
      if (listData.ok) setSchedules(listData.items as ScheduleRowDTO[]);
    } catch (e) {
      setScheduleMsg({ kind: "err", text: e instanceof Error ? e.message : "Ошибка сети" });
    } finally {
      setScheduleBusy(false);
    }
  }

  /** Пресет «Создать стандартное расписание» — 9:00 ежедневно, общий за вчера, мне (РОПу). */
  async function createDefaultSchedule() {
    const r = defaultRecipientUser();
    if (!r) {
      setScheduleMsg({ kind: "err", text: "Нет получателей с привязкой к Bitrix — добавьте РОПа в /users." });
      return;
    }
    setScheduleBusy(true);
    setScheduleMsg(null);
    try {
      const res = await fetch(`/call-agent/api/reports/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Утренний отчёт",
          scope: "team",
          recipientKind: "user",
          recipientId: r.id,
          recipientName: r.name,
          frequency: "daily",
          time: "09:00",
          periodKind: "yesterday",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setScheduleMsg({ kind: "err", text: data.error || "Не удалось создать" });
        return;
      }
      const item: ScheduleRowDTO = data.item;
      setSchedules((prev) => [item, ...prev]);
      setScheduleMsg({
        kind: "ok",
        text: `Создано. Следующий запуск: ${formatDateRu(item.next_run_at)}`,
      });
    } catch (e) {
      setScheduleMsg({ kind: "err", text: e instanceof Error ? e.message : "Ошибка сети" });
    } finally {
      setScheduleBusy(false);
    }
  }

  return (
    <>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="ds-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={24} strokeWidth={2} />
          Отчёты
        </h1>
        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 6 }}>
          Сформируйте отчёт за период и отправьте менеджерам в Bitrix-мессенджер.
        </p>
      </div>

      <div className="ds-card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* ── Тип отчёта ── */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Тип отчёта</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {([
              { val: "manager" as Scope, label: "По менеджеру", hint: "персональный" },
              { val: "team" as Scope, label: "Общий по команде", hint: "" },
            ]).map((opt) => {
              const active = scope === opt.val;
              return (
                <label
                  key={opt.val}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "8px 14px", borderRadius: 8, cursor: busy ? "wait" : "pointer",
                    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                    background: active ? "color-mix(in oklch, var(--primary) 12%, var(--card))" : "var(--card)",
                    color: active ? "var(--primary)" : "var(--foreground)",
                    fontWeight: active ? 600 : 500, fontSize: 14,
                  }}
                >
                  <input
                    type="radio"
                    name="report-scope"
                    checked={active}
                    disabled={busy}
                    onChange={() => { setScope(opt.val); setSendInfo(null); }}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  {opt.label}
                  {opt.hint && (
                    <span style={{ color: "var(--muted-foreground)", fontWeight: 400, fontSize: 12 }}>
                      ({opt.hint})
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* ── Выбор менеджера (только для scope=manager) ── */}
        {scope === "manager" && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Менеджер</div>
            {managers.length === 0 ? (
              <p className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
                Нет менеджеров с привязкой к Bitrix.
              </p>
            ) : (
              <select
                className="ds-input"
                value={managerId}
                disabled={busy}
                onChange={(e) => { setManagerId(e.target.value); setSendInfo(null); }}
                style={{ maxWidth: 360 }}
              >
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ── Период ── */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Период</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                onClick={() => { setPresetKey(p.key); setSendInfo(null); }}
                className={`ds-btn ${presetKey === p.key ? "ds-btn-primary" : "ds-btn-secondary"}`}
                style={{ height: 32, padding: "0 12px", fontSize: 13, whiteSpace: "nowrap" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Кому отправить (получатель) ── */}
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>Кому отправить</div>
          <select
            className="ds-input"
            value={recipientId}
            disabled={busy}
            onChange={(e) => { setRecipientId(e.target.value); setSendInfo(null); }}
            style={{ maxWidth: 360 }}
          >
            <option value="">
              {scope === "manager"
                ? "По умолчанию — самому менеджеру"
                : "По умолчанию — всем РОПам / владельцам"}
            </option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>{r.name || `ID ${r.id}`}</option>
            ))}
          </select>
          <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 6 }}>
            Выберите получателя, чтобы отправить отчёт конкретному человеку (например, РОПу) —
            независимо от того, про кого отчёт. Только превью получателя не учитывает.
          </p>
        </div>

        {/* ── Действия ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={doPreview}
            disabled={busy}
            className="ds-btn ds-btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {previewing ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}
            Сформировать превью
          </button>
          <button
            type="button"
            onClick={doSend}
            disabled={busy}
            className="ds-btn ds-btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            {sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
            Отправить в Bitrix
          </button>
        </div>

        {/* ── Ошибка ── */}
        {error && (
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
              borderRadius: 8, fontSize: 14,
              border: "1px solid var(--destructive)",
              background: "color-mix(in oklch, var(--destructive) 10%, var(--card))",
              color: "var(--destructive)",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Результат отправки ── */}
        {sendInfo && (
          <div
            style={{
              padding: "12px 14px", borderRadius: 8, fontSize: 14,
              border: `1px solid ${sendInfo.sent > 0 ? "var(--primary)" : "var(--destructive)"}`,
              background: sendInfo.sent > 0
                ? "color-mix(in oklch, var(--primary) 8%, var(--card))"
                : "color-mix(in oklch, var(--destructive) 8%, var(--card))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              {sendInfo.sent > 0
                ? <CheckCircle2 size={16} style={{ color: "var(--primary)" }} />
                : <AlertCircle size={16} style={{ color: "var(--destructive)" }} />}
              {sendInfo.dry
                ? `Тестовый режим (dry-run): сообщения НЕ отправлены в Bitrix. Обработано ${sendInfo.total}.`
                : `Отправлено: ${sendInfo.sent} из ${sendInfo.total}`}
            </div>
            {sendInfo.dry && (
              <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 4 }}>
                Включён DRY_RUN — отправка в Bitrix отключена. Снимите флаг на сервере, чтобы слать вживую.
              </p>
            )}
            {sendInfo.results.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                {sendInfo.results.map((r, i) => (
                  <li key={i} style={{ fontSize: 13, color: r.ok ? "var(--foreground)" : "var(--destructive)" }}>
                    {r.recipientName || `Bitrix ID ${r.recipient}`}
                    {" — "}
                    {r.ok
                      ? (r.mode === "dry" ? "подготовлено (dry)" : "отправлено")
                      : `ошибка: ${r.error || "неизвестно"}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Превью текста ── */}
        {preview && (
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13, color: "var(--foreground)" }}>
              Превью {preview.title ? `— ${preview.title}` : ""}
            </div>
            <textarea
              className="ds-textarea"
              readOnly
              value={preview.text}
              style={{ width: "100%", minHeight: 280, fontFamily: "var(--font-mono, monospace)", fontSize: 13, lineHeight: 1.5 }}
            />
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ══════════════ Расписание автоотправки в Bitrix ═══════════════════ */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="ds-card" style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <h2 className="ds-h2" style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
            <CalendarClock size={20} strokeWidth={2} />
            Расписание автоотправки
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {schedules.length === 0 && (
              <button
                type="button"
                onClick={createDefaultSchedule}
                disabled={scheduleBusy}
                className="ds-btn ds-btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <Clock size={14} />
                Создать стандартное (9:00 ежедневно, мне)
              </button>
            )}
            <button
              type="button"
              onClick={openCreate}
              disabled={scheduleBusy}
              className="ds-btn ds-btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <Plus size={14} />
              Добавить расписание
            </button>
          </div>
        </div>

        <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", margin: 0 }}>
          Отчёты автоматически уходят в личку или групповой чат Bitrix в указанное время.
          Воркер проверяет расписания раз в минуту.
        </p>

        {/* Сообщение/ошибка по результатам действий */}
        {scheduleMsg && (
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
              borderRadius: 8, fontSize: 14,
              border: `1px solid ${scheduleMsg.kind === "ok" ? "var(--primary)" : "var(--destructive)"}`,
              background: scheduleMsg.kind === "ok"
                ? "color-mix(in oklch, var(--primary) 8%, var(--card))"
                : "color-mix(in oklch, var(--destructive) 8%, var(--card))",
              color: scheduleMsg.kind === "ok" ? "var(--foreground)" : "var(--destructive)",
            }}
          >
            {scheduleMsg.kind === "ok"
              ? <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1, color: "var(--primary)" }} />
              : <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{scheduleMsg.text}</span>
          </div>
        )}

        {/* Таблица расписаний */}
        {schedules.length === 0 ? (
          <p className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            Расписания не настроены. Создайте первое — и отчёт будет уходить автоматически.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Название</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Получатель</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Частота</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Период</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>След. запуск</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Последний</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600 }}>Вкл</th>
                  <th style={{ padding: "8px 6px", fontWeight: 600, textAlign: "right" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const isEnabled = !!s.enabled;
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border)", opacity: isEnabled ? 1 : 0.55 }}>
                      <td style={{ padding: "8px 6px" }}>
                        <div style={{ fontWeight: 600, color: "var(--foreground)" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                          {s.scope === "manager" ? "по менеджеру" : "общий по команде"}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {s.recipient_kind === "chat"
                            ? <MessageSquare size={13} style={{ color: "var(--muted-foreground)" }} />
                            : <UserIcon size={13} style={{ color: "var(--muted-foreground)" }} />}
                          {s.recipient_name || s.recipient_id}
                        </span>
                      </td>
                      <td style={{ padding: "8px 6px" }}>{frequencyLabel(s)}</td>
                      <td style={{ padding: "8px 6px" }}>{PERIOD_LABELS[s.period_kind]}</td>
                      <td style={{ padding: "8px 6px" }}>{formatDateRu(s.next_run_at)}</td>
                      <td style={{ padding: "8px 6px" }}>
                        {s.last_run_at ? (
                          <span style={{
                            color: s.last_run_status === "ok" ? "var(--foreground)" : "var(--destructive)",
                          }}>
                            {formatDateRu(s.last_run_at)} {s.last_run_status === "ok" ? "✓" : "✗"}
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ padding: "8px 6px" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", cursor: scheduleBusy ? "wait" : "pointer" }}>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            disabled={scheduleBusy}
                            onChange={() => toggleScheduleEnabled(s)}
                            style={{ accentColor: "var(--primary)" }}
                          />
                        </label>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button
                            type="button"
                            title="Запустить сейчас"
                            disabled={scheduleBusy}
                            onClick={() => runScheduleNow(s.id)}
                            className="ds-btn ds-btn-secondary"
                            style={{ height: 28, padding: "0 8px" }}
                          >
                            <Play size={13} />
                          </button>
                          <button
                            type="button"
                            title="Изменить"
                            disabled={scheduleBusy}
                            onClick={() => openEdit(s)}
                            className="ds-btn ds-btn-secondary"
                            style={{ height: 28, padding: "0 8px" }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Удалить"
                            disabled={scheduleBusy}
                            onClick={() => deleteScheduleById(s.id)}
                            className="ds-btn ds-btn-secondary"
                            style={{ height: 28, padding: "0 8px", color: "var(--destructive)" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Форма создания/редактирования расписания ── */}
        {showForm && (
          <div
            style={{
              padding: 16, borderRadius: 10,
              border: "1px solid var(--border)",
              background: "color-mix(in oklch, var(--primary) 4%, var(--card))",
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 14, color: "var(--foreground)" }}>
                {editingId ? "Изменить расписание" : "Новое расписание"}
              </strong>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="ds-btn ds-btn-secondary"
                style={{ height: 28, padding: "0 8px" }}
                title="Закрыть"
              >
                <X size={14} />
              </button>
            </div>

            {/* Название */}
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                Название
              </label>
              <input
                className="ds-input"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                style={{ maxWidth: 360 }}
              />
            </div>

            {/* Тип отчёта */}
            <div>
              <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Тип отчёта</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(["team", "manager"] as Scope[]).map((v) => {
                  const active = fScope === v;
                  return (
                    <label key={v} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                      border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                      background: active ? "color-mix(in oklch, var(--primary) 12%, var(--card))" : "var(--card)",
                      color: active ? "var(--primary)" : "var(--foreground)",
                      fontWeight: active ? 600 : 500,
                    }}>
                      <input
                        type="radio"
                        name="sch-scope"
                        checked={active}
                        onChange={() => setFScope(v)}
                        style={{ accentColor: "var(--primary)" }}
                      />
                      {v === "team" ? "Общий по команде" : "По менеджеру"}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Менеджер */}
            {fScope === "manager" && (
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                  Менеджер
                </label>
                {managers.length === 0 ? (
                  <p className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
                    Нет менеджеров с привязкой к Bitrix.
                  </p>
                ) : (
                  <select
                    className="ds-input"
                    value={fManagerId}
                    onChange={(e) => setFManagerId(e.target.value)}
                    style={{ maxWidth: 360 }}
                  >
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name || `ID ${m.id}`}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Кому отправить */}
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                Кому отправить
              </label>
              <select
                className="ds-input"
                value={fRecipientSel}
                onChange={(e) => { setFRecipientSel(e.target.value); setFManualValid(null); }}
                style={{ maxWidth: 420 }}
              >
                <optgroup label="Личные сообщения">
                  {recipients.map((r) => (
                    <option key={`u-${r.id}`} value={`user:${r.id}`}>{r.name || `ID ${r.id}`}</option>
                  ))}
                  {recipients.length === 0 && (
                    <option value="" disabled>Нет пользователей с привязкой к Bitrix</option>
                  )}
                </optgroup>
                {chats.filter((c) => c.type === "chat").length > 0 && (
                  <optgroup label="Чаты Bitrix">
                    {chats.filter((c) => c.type === "chat").map((c) => (
                      <option key={`c-${c.id}`} value={`chat:${c.id}`}>{c.title}</option>
                    ))}
                  </optgroup>
                )}
                <option value="manual">Ввести ID чата вручную…</option>
              </select>

              {/* Ручной ввод ID чата */}
              {fRecipientSel === "manual" && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <input
                    className="ds-input"
                    placeholder="chat123 или 123"
                    value={fManualChatId}
                    onChange={(e) => { setFManualChatId(e.target.value); setFManualValid(null); }}
                    style={{ width: 220 }}
                  />
                  <button
                    type="button"
                    onClick={validateManualChat}
                    disabled={scheduleBusy}
                    className="ds-btn ds-btn-secondary"
                    style={{ height: 32, padding: "0 12px", fontSize: 13 }}
                  >
                    Проверить
                  </button>
                  {fManualValid && (
                    <span style={{
                      fontSize: 12,
                      color: fManualValid.ok ? "var(--primary)" : "var(--destructive)",
                    }}>
                      {fManualValid.ok ? `✓ ${fManualValid.title ?? "найдено"}` : `✗ ${fManualValid.error}`}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Частота + время */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <div>
                <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Частота</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["daily", "weekly"] as Frequency[]).map((v) => {
                    const active = fFrequency === v;
                    return (
                      <label key={v} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                        background: active ? "color-mix(in oklch, var(--primary) 12%, var(--card))" : "var(--card)",
                        color: active ? "var(--primary)" : "var(--foreground)",
                        fontWeight: active ? 600 : 500,
                      }}>
                        <input
                          type="radio"
                          name="sch-freq"
                          checked={active}
                          onChange={() => setFFrequency(v)}
                          style={{ accentColor: "var(--primary)" }}
                        />
                        {v === "daily" ? "Ежедневно" : "Еженедельно"}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Время</div>
                <input
                  type="time"
                  className="ds-input"
                  value={fTime}
                  onChange={(e) => setFTime(e.target.value)}
                  style={{ width: 140 }}
                />
              </div>
            </div>

            {/* Дни недели — только для weekly */}
            {fFrequency === "weekly" && (
              <div>
                <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Дни недели</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {WEEK_DAYS.map((d) => {
                    const active = fDays.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                          border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                          background: active ? "color-mix(in oklch, var(--primary) 12%, var(--card))" : "var(--card)",
                          color: active ? "var(--primary)" : "var(--foreground)",
                          fontWeight: active ? 600 : 500,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => {
                            if (e.target.checked) setFDays((p) => [...p, d.id].sort((a, b) => a - b));
                            else setFDays((p) => p.filter((x) => x !== d.id));
                          }}
                          style={{ accentColor: "var(--primary)" }}
                        />
                        {d.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Период отчёта */}
            <div>
              <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>Период отчёта</div>
              <select
                className="ds-input"
                value={fPeriod}
                onChange={(e) => setFPeriod(e.target.value as PeriodKind)}
                style={{ maxWidth: 280 }}
              >
                {PERIOD_KINDS.map((k) => (
                  <option key={k} value={k}>{PERIOD_LABELS[k]}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={saveSchedule}
                disabled={scheduleBusy}
                className="ds-btn ds-btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {scheduleBusy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {editingId ? "Сохранить" : "Создать"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                disabled={scheduleBusy}
                className="ds-btn ds-btn-secondary"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`.spin{animation:reports-spin 0.8s linear infinite}@keyframes reports-spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
