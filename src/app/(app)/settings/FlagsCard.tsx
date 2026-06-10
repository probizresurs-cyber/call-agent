"use client";

/**
 * Карточка системных флагов: STANDALONE (read-only) + DRY_RUN (два независимых
 * рубильника per-tenant — CRM-write и отчёты в мессенджер).
 *
 * Видно только owner/admin. STANDALONE — из ENV, DRY_RUN — в tenants.settings.
 *
 * Зачем два рубильника: CRM-write (запись комментариев в timeline сделок) и
 * отправка отчётов через бота в мессенджер — это разные уровни риска. CRM-write
 * пишет в чужую CRM и виден всем — его выключают первым. Отчёты в мессенджер
 * никаких чужих записей не создают и обычно включаются раньше.
 */
import { useState } from "react";
import { ShieldAlert, ShieldCheck, Server, FileText, MessagesSquare } from "lucide-react";

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
      {/* STANDALONE — read-only */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Server size={16} strokeWidth={2} color="var(--muted-foreground)" />
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Режим работы</div>
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
              {initial.standalone ? "Standalone — собственная инсталляция" : "Встроенный в Company24 Core (SSO)"}
            </div>
          </div>
        </div>
        <span className="ds-badge" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
          {initial.standalone ? "STANDALONE" : "EMBEDDED"}
        </span>
      </div>

      {/* DRY_RUN: CRM-write (запись комментариев в timeline сделок Bitrix) */}
      <FlagRow
        icon={<FileText size={16} strokeWidth={2} color={dryRunCrm ? "var(--success)" : "var(--destructive)"} />}
        title="DRY_RUN — комментарии в CRM Bitrix"
        on={dryRunCrm}
        busy={busy === "crm"}
        onToggle={() => toggle("crm")}
        descOn={<>Комментарии анализа звонка <b>НЕ пишутся</b> в timeline сделок/лидов Bitrix.
          Можно безопасно тестировать pipeline — чужие сделки не получают наших записей.</>}
        descOff={<>Анализ <b>пишется</b> комментарием в timeline сделки/лида Bitrix.
          Виден всем кто работает со сделкой. Убедись что текст и формат финальны.</>}
      />

      {/* DRY_RUN: messages (отчёты через бота в мессенджер Bitrix) */}
      <FlagRow
        icon={<MessagesSquare size={16} strokeWidth={2} color={dryRunMessages ? "var(--success)" : "var(--destructive)"} />}
        title="DRY_RUN — отчёты в мессенджер Bitrix"
        on={dryRunMessages}
        busy={busy === "messages"}
        onToggle={() => toggle("messages")}
        descOn={<>Отчёты через бота «Call-Agent» <b>НЕ отправляются</b> в Bitrix-мессенджер.
          UI показывает «подготовлено (dry)». Удобно для тестирования формата отчёта.</>}
        descOff={<>Отчёты <b>уходят вживую</b> от бота «Call-Agent» в личку юзера или в групповой чат.
          Работает и ручная кнопка «Отправить», и авто-расписания.</>}
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
        Рекомендуемая последовательность включения: сначала <b>отчёты OFF</b> (вживую),
        протестировать на себе/РОПе → потом <b>CRM-write OFF</b>, когда формат финальный
        и команда готова видеть анализ прямо в сделках Bitrix.
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
        {busy ? "..." : (on ? "ON" : "OFF")}
      </button>
    </div>
  );
}
