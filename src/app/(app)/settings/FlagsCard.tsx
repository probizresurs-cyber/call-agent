"use client";

/**
 * Карточка системных флагов: STANDALONE (read-only) + DRY_RUN (переключаемый per-tenant).
 * Видно только owner/admin. STANDALONE — из ENV, DRY_RUN — в tenants.settings.
 */
import { useState } from "react";
import { ShieldAlert, ShieldCheck, Server } from "lucide-react";

export interface FlagsInitial {
  standalone: boolean;
  dryRunGlobal: boolean;
  dryRunForTenant: boolean;
}

export function FlagsCard({ initial }: { initial: FlagsInitial }) {
  const [dryRun, setDryRun] = useState(initial.dryRunForTenant);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/call-agent/api/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dry_run: !dryRun }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "unknown");
      setDryRun(data.dryRunForTenant);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
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

      {/* DRY_RUN — переключаемый per-tenant */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
          {dryRun
            ? <ShieldCheck size={16} strokeWidth={2} color="var(--success)" />
            : <ShieldAlert size={16} strokeWidth={2} color="var(--destructive)" />}
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              DRY_RUN (исходящие интеграции)
            </div>
            <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 2 }}>
              {dryRun ? (
                <>Предохранитель <b>включён</b>. Записи в Bitrix CRM, отправка в Telegram-бот заказчика и другие
                «уходящие наружу» операции <b>формируются и логируются, но не отправляются</b>.</>
              ) : (
                <>Предохранитель <b>выключен</b>. Все операции выполняются по-настоящему — пишутся в CRM,
                отправляются заказчикам. Будьте уверены что готовы.</>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className="ds-button"
          style={{
            marginLeft: 12,
            background: dryRun ? "var(--success)" : "var(--destructive)",
            color: "white",
            opacity: busy ? 0.6 : 1,
            minWidth: 100,
          }}
        >
          {busy ? "..." : (dryRun ? "ON" : "OFF")}
        </button>
      </div>

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
        Сейчас CRM-write и Telegram-каналы ещё не подключены, поэтому DRY_RUN не на что влияет.
        Но переключатель уже здесь — чтобы при подключении интеграций (Фаза 1 / §5.5 ТЗ)
        не было ситуации «забыли поставить предохранитель и снесли заказчику половину карточек».
      </div>
    </div>
  );
}
