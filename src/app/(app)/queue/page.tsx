/**
 * Страница «Очередь» — §4.3 MASTER-TZ.
 *
 * Показывает состояние пайплайна обработки в разрезе тенанта:
 *  - количество в каждом статусе (pending, processing, done, failed, no_recording)
 *  - скорость обработки (звонков/час за последний час и за день)
 *  - доля failed и распределение по типу ошибки
 *  - отставание сбора (время с последнего успешно обработанного звонка)
 *  - распределение источников ошибок (Anthropic / OpenAI / Bitrix / DB)
 *
 * Доступ: owner / admin / head. Менеджер не видит — это операционная инфа.
 */
import { redirect } from "next/navigation";
import { Activity, Hourglass, CheckCircle2, XCircle, FileX, Clock, AlertTriangle, Zap } from "lucide-react";
import { getDbAsync } from "@/lib/db-compat";
import { getSessionUser } from "@/lib/auth";
import { rlsFor } from "@/lib/rls";

export const dynamic = "force-dynamic";

type StatusCount = { status: string; n: number };
type ErrorBucket = { bucket: string; n: number };
type DailyThroughput = { day: string; done: number; failed: number };

const PROCESSING_STATUSES = ["downloading", "transcribing", "analyzing", "syncing"];

// Группировка ошибок по prefix-словам для понимания "где больно"
function bucketError(err: string): string {
  const e = err.toLowerCase();
  if (/anthropic|claude|529|overloaded/.test(e)) return "Anthropic (LLM)";
  if (/openai|whisper|transcribe|country/.test(e)) return "OpenAI (Whisper)";
  if (/bitrix|portal_user|crm|webhook/.test(e)) return "Bitrix24";
  if (/recording|no.?file|files in activity|webdav/.test(e)) return "Нет записи";
  if (/postgres|sqlite|column|relation|database/.test(e)) return "База данных";
  if (/timeout|econnreset|fetch failed|socket hang/.test(e)) return "Сеть";
  if (/credit balance|payment/.test(e)) return "Закончились кредиты";
  if (/forbidden|403|request not allowed/.test(e)) return "Гео-блок / прокси";
  return "Прочее";
}

export default async function QueuePage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role === "manager") redirect("/dashboard");

  const db = getDbAsync();
  const rls = rlsFor(me, { table: "c" });

  // 1) Счётчики по статусам
  const statusRows = await db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM calls c
       WHERE ${rls.sql}
       GROUP BY status
       ORDER BY n DESC`
    )
    .all<StatusCount>(...rls.params);
  const totals: Record<string, number> = {};
  for (const r of statusRows) totals[r.status] = Number(r.n);
  const total = statusRows.reduce((s, r) => s + Number(r.n), 0);
  const processing = PROCESSING_STATUSES.reduce((s, st) => s + (totals[st] ?? 0), 0);

  // 2) Скорость обработки (done за последний час и день)
  const speedRow = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN updated_at >= datetime('now', '-1 hour') THEN 1 ELSE 0 END) AS last_hour,
         SUM(CASE WHEN updated_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS last_day
       FROM calls c
       WHERE ${rls.sql} AND status = 'done'`
    )
    .get<{ last_hour: number; last_day: number }>(...rls.params);
  const lastHour = Number(speedRow?.last_hour ?? 0);
  const lastDay = Number(speedRow?.last_day ?? 0);

  // 3) Отставание — сколько времени прошло с последнего успешного звонка
  const lagRow = await db
    .prepare(
      `SELECT MAX(updated_at) AS last_done FROM calls c
       WHERE ${rls.sql} AND status = 'done'`
    )
    .get<{ last_done: string | null }>(...rls.params);
  const lastDoneAt = lagRow?.last_done ?? null;
  const lagMinutes = lastDoneAt ? Math.max(0, Math.floor((Date.now() - parseDate(lastDoneAt).getTime()) / 60000)) : null;

  // 4) Распределение ошибок по источникам
  const errorRows = await db
    .prepare(
      `SELECT error FROM calls c
       WHERE ${rls.sql} AND status = 'failed' AND error IS NOT NULL`
    )
    .all<{ error: string }>(...rls.params);
  const buckets: Record<string, number> = {};
  for (const r of errorRows) {
    const b = bucketError(r.error);
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  const errorBuckets: ErrorBucket[] = Object.entries(buckets)
    .map(([bucket, n]) => ({ bucket, n }))
    .sort((a, b) => b.n - a.n);

  // 5) Throughput за последние 7 дней
  const daily = await db
    .prepare(
      `SELECT substr(updated_at, 1, 10) AS day,
              SUM(CASE WHEN status='done'   THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM calls c
       WHERE ${rls.sql}
         AND substr(updated_at, 1, 10) >= date('now', '-6 day')
       GROUP BY day
       ORDER BY day ASC`
    )
    .all<DailyThroughput>(...rls.params);

  const failedTotal = totals["failed"] ?? 0;
  const failedShare = total > 0 ? (failedTotal / total) * 100 : 0;

  return (
    <>
      <h1 className="ds-h1" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
        <Activity size={22} strokeWidth={2} /> Очередь обработки
      </h1>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 20 }}>
        Состояние пайплайна анализа звонков в реальном времени.
      </p>

      {/* KPI-карточки */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard
          icon={<Hourglass size={18} strokeWidth={2} />}
          label="В ожидании"
          value={String(totals["pending"] ?? 0)}
          color="var(--warning)"
          hint="Ждут когда воркер их подберёт"
        />
        <KpiCard
          icon={<Zap size={18} strokeWidth={2} />}
          label="В обработке"
          value={String(processing)}
          color="var(--primary)"
          hint={PROCESSING_STATUSES.join(" → ")}
        />
        <KpiCard
          icon={<CheckCircle2 size={18} strokeWidth={2} />}
          label="Готово"
          value={String(totals["done"] ?? 0)}
          color="var(--success)"
          hint="Успешно проанализированы"
        />
        <KpiCard
          icon={<XCircle size={18} strokeWidth={2} />}
          label="Ошибка"
          value={String(failedTotal)}
          color="var(--destructive)"
          hint={`${failedShare.toFixed(1)}% от всех`}
        />
        <KpiCard
          icon={<FileX size={18} strokeWidth={2} />}
          label="Без записи"
          value={String(totals["no_recording"] ?? 0)}
          color="var(--muted-foreground)"
          hint="Bitrix не вернул файл"
        />
      </div>

      {/* Скорость и отставание */}
      <div className="ds-card" style={{ marginBottom: 20 }}>
        <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={16} strokeWidth={2} /> Скорость и отставание
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <Metric label="Обработано за час" value={`${lastHour} звонков`} hint={lastHour > 0 ? `~${Math.round(60 / lastHour * 10) / 10} мин/звонок` : "—"} />
          <Metric label="Обработано за день" value={`${lastDay} звонков`} hint={lastDay > 0 ? `~${Math.round(lastDay / 24)} в час в среднем` : "—"} />
          <Metric
            label="Отставание"
            value={lagMinutes == null ? "—" : lagMinutes < 60 ? `${lagMinutes} мин` : `${Math.floor(lagMinutes / 60)} ч ${lagMinutes % 60} мин`}
            hint={lastDoneAt ? `Последний done: ${formatDateTime(lastDoneAt)}` : "Не было успешных"}
            warn={lagMinutes != null && lagMinutes > 30}
          />
        </div>
      </div>

      {/* Распределение ошибок */}
      <div className="ds-card" style={{ marginBottom: 20 }}>
        <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} strokeWidth={2} /> Источники ошибок
        </h2>
        {errorBuckets.length === 0 ? (
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            Нет failed-звонков. Все звонки либо обработаны успешно, либо без записи.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {errorBuckets.map((b) => {
              const pct = (b.n / failedTotal) * 100;
              return (
                <div key={b.bucket}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{b.bucket}</span>
                    <span style={{ color: "var(--muted-foreground)" }}>{b.n} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div style={{ height: 6, background: "var(--muted)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--destructive)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Throughput по дням */}
      {daily.length > 0 && (
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 14 }}>Динамика обработки (7 дней)</h2>
          <table className="ds-table">
            <thead>
              <tr>
                <th>День</th>
                <th style={{ textAlign: "right" }}>Готово</th>
                <th style={{ textAlign: "right" }}>Ошибки</th>
                <th style={{ textAlign: "right" }}>% успеха</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => {
                const sum = Number(d.done) + Number(d.failed);
                const successPct = sum > 0 ? (Number(d.done) / sum) * 100 : 0;
                return (
                  <tr key={d.day}>
                    <td>{formatDay(d.day)}</td>
                    <td style={{ textAlign: "right", color: "var(--success)", fontWeight: 600 }}>{d.done}</td>
                    <td style={{ textAlign: "right", color: Number(d.failed) > 0 ? "var(--destructive)" : "var(--muted-foreground)" }}>{d.failed}</td>
                    <td style={{ textAlign: "right" }}>{successPct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Components ──────────────────────────────────────────

function KpiCard({ icon, label, value, color, hint }: {
  icon: React.ReactNode; label: string; value: string; color: string; hint?: string;
}) {
  return (
    <div className="ds-card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color, marginBottom: 6 }}>
        {icon}
        <span className="ds-body-sm" style={{ textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      {hint && <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 4, fontSize: 11 }}>{hint}</div>}
    </div>
  );
}

function Metric({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div>
      <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: warn ? "var(--warning)" : "inherit" }}>{value}</div>
      {hint && <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────

function parseDate(s: string): Date {
  // PG: "2026-06-02 10:53:22+00", SQLite: "2026-06-02 10:53:22"
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function formatDateTime(s: string): string {
  return parseDate(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

function formatDay(s: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(2, 4)}`;
}
