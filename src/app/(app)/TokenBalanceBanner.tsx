"use client";

/**
 * Тонкий баннер о балансе токенов вверху портала. Показывается owner/admin/head,
 * когда баланс на исходе (≤ порога) или обработка заблокирована (enforce + 0).
 * Молчит, когда токенов достаточно. Данные — GET /api/tokens/status.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Coins } from "lucide-react";

interface Status {
  show: boolean;
  balance: number;
  low: boolean;
  blocked: boolean;
  lowThreshold: number;
  periodEnd: string | null;
  daysUntilPeriodEnd: number | null;
}

export function TokenBalanceBanner() {
  const [st, setSt] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/call-agent/api/tokens/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive && d.ok) setSt(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const periodSoon = !!st && st.daysUntilPeriodEnd != null && st.daysUntilPeriodEnd >= 0 && st.daysUntilPeriodEnd <= 7;
  if (!st || !st.show || (!st.low && !st.blocked && !periodSoon)) return null;

  const blocked = st.blocked;
  const color = blocked ? "#dc2626" : "#d97706";

  return (
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        background: `color-mix(in srgb, ${color} 12%, var(--card))`,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        borderRadius: 10, padding: "10px 14px", marginBottom: 16,
        color: "var(--foreground)", fontSize: 14, lineHeight: 1.45,
      }}
    >
      {blocked
        ? <AlertTriangle size={18} style={{ color, flexShrink: 0 }} />
        : <Coins size={18} style={{ color, flexShrink: 0 }} />}
      <div>
        {blocked ? (
          <>
            <b>Обработка приостановлена:</b> закончились токены (баланс {st.balance}).
            Новые звонки не анализируются, пока не пополните баланс.
          </>
        ) : st.low ? (
          <>
            <b>Токены на исходе:</b> осталось <b>{st.balance}</b>. Пополните баланс,
            чтобы анализ звонков не прервался.
          </>
        ) : (
          <>
            <b>Период заканчивается{st.daysUntilPeriodEnd === 0 ? " сегодня" : ` через ${st.daysUntilPeriodEnd} дн.`}</b>
            {st.periodEnd ? ` (${st.periodEnd.split("-").reverse().join(".")})` : ""}. Продлите доступ,
            чтобы анализ звонков не прервался.
          </>
        )}
      </div>
    </div>
  );
}
