"use client";

/**
 * Карточка «Автоматическая отправка» — два независимых переключателя per-tenant:
 * запись комментариев в CRM Bitrix и отправка отчётов в мессенджер.
 *
 * Видно только owner/admin. Текст — клиентский, без внутренней терминологии
 * (это конечный пользователь-заказчик, а не разработчик).
 *
 * Зачем два переключателя: запись в CRM видна всем, кто работает со сделкой —
 * её обычно выключают первой на время проверки. Отчёты в мессенджер ничьих
 * чужих записей не создают, поэтому их обычно включают раньше.
 */
import { useState } from "react";
import { ShieldAlert, ShieldCheck, FileText, MessagesSquare } from "lucide-react";

export interface FlagsInitial {
  standalone: boolean;
  dryRunGlobal: boolean;
  /** Legacy общий per-tenant — оставлен для совместимости, в новом UI не используется. */
  dryRunForTenant: boolean;
  dryRunCrm: boolean;
  dryRunMessages: boolean;
}

export function FlagsCard({ initial }: { initial: FlagsInitial }) {
  const [dryRunCrm, setDryRunCrm] = useState(initial.dryRunCrm);
  const [dryRunMessages, setDryRunMessages] = useState(initial.dryRunMessages);
  const [busy, setBusy] = useState<"crm" | "messages" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(kind: "crm" | "messages") {
    const current = kind === "crm" ? dryRunCrm : dryRunMessages;
    setBusy(kind); setErr(null);
    try {
      const res = await fetch("/call-agent/api/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dry_run: !current, kind }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "unknown");
      setDryRunCrm(data.dryRunCrm);
      setDryRunMessages(data.dryRunMessages);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Запись комментариев в сделки/лиды Bitrix */}
      <FlagRow
        icon={<FileText size={16} strokeWidth={2} color={dryRunCrm ? "var(--success)" : "var(--destructive)"} />}
        title="Запись в CRM Bitrix"
        on={dryRunCrm}
        busy={busy === "crm"}
        onToggle={() => toggle("crm")}
        descOn={<>Разбор звонка пока <b>НЕ добавляется</b> в сделки и лиды Bitrix — можно спокойно
          проверить, как это работает, ничего лишнего в карточки не попадёт.</>}
        descOff={<>Разбор звонка <b>автоматически добавляется</b> комментарием в сделку или лид
          Bitrix — его увидят все, кто работает с этой сделкой.</>}
      />

      {/* Отправка отчётов в мессенджер Bitrix */}
      <FlagRow
        icon={<MessagesSquare size={16} strokeWidth={2} color={dryRunMessages ? "var(--success)" : "var(--destructive)"} />}
        title="Отправка отчётов в мессенджер"
        on={dryRunMessages}
        busy={busy === "messages"}
        onToggle={() => toggle("messages")}
        descOn={<>Отчёты пока <b>НЕ отправляются</b> в мессенджер Bitrix — можно проверить,
          как выглядит текст отчёта, прежде чем включать по-настоящему.</>}
        descOff={<>Отчёты <b>отправляются по-настоящему</b> — и кнопкой «Отправить» вручную,
          и по расписанию, если оно настроено.</>}
      />

      {err && (
        <div style={{
          padding: 8, background: "rgba(220,38,38,0.08)",
          border: "1px solid rgba(220,38,38,0.30)",
          borderRadius: 6, fontSize: 13, color: "var(--destructive)",
        }}>
          {err}
        </div>
      )}

      <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11, lineHeight: 1.5 }}>
        Рекомендуем сначала включить отправку отчётов и проверить на себе, а затем —
        запись в CRM Bitrix, когда убедитесь, что формат разбора вас устраивает.
      </div>
    </div>
  );
}

function FlagRow({
  icon, title, on, busy, onToggle, descOn, descOff,
}: {
  icon: React.ReactNode;
  title: string;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
  descOn: React.ReactNode;
  descOff: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      padding: "12px 0", borderTop: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
        {on
          ? <ShieldCheck size={16} strokeWidth={2} color="var(--success)" style={{ marginTop: 2 }} />
          : <ShieldAlert size={16} strokeWidth={2} color="var(--destructive)" style={{ marginTop: 2 }} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {icon}
            <div style={{ fontWeight: 500, fontSize: 14 }}>{title}</div>
          </div>
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            {on ? descOn : descOff}
          </div>
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={busy}
        className="ds-button"
        style={{
          marginLeft: 12,
          background: on ? "var(--success)" : "var(--destructive)",
          color: "white",
          opacity: busy ? 0.6 : 1,
          minWidth: 100,
        }}
      >
        {busy ? "..." : (on ? "Тест" : "Отправка идёт")}
      </button>
    </div>
  );
}
