/**
 * §4.6 MASTER-TZ — список заказчиков с метриками и индикатором loose-threads.
 *
 * Доступ:
 *   - owner/admin/head — все заказчики тенанта
 *   - manager — только заказчики с которыми сам взаимодействовал (фильтр по bitrixManagerId)
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, AlertCircle, Smile, Meh, Frown } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { listClients } from "@/lib/clients";
import { ClientsSearch } from "./ClientsSearch";

export const dynamic = "force-dynamic";

export default async function ClientsListPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const sp = await props.searchParams;

  const clients = await listClients({
    tenantId: me.tenantId,
    managerId: me.role === "manager" ? me.bitrixManagerId : undefined,
    search: sp.q,
    limit: 100,
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <h1 className="ds-h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={22} strokeWidth={2} /> Заказчики
        </h1>
        <div className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
          Найдено: <b>{clients.length}</b>{clients.length === 100 ? " (топ 100)" : ""}
        </div>
      </div>

      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 16 }}>
        Все люди с которыми велась коммуникация — звонки, чаты, email, встречи в одной картине.
        Клик по строке → полная история по заказчику.
      </p>

      <ClientsSearch initial={sp.q || ""} />

      {clients.length === 0 ? (
        <div className="ds-card" style={{ textAlign: "center", padding: 40 }}>
          <div className="ds-body" style={{ color: "var(--muted-foreground)" }}>
            Нет заказчиков. Звонки и взаимодействия появятся здесь автоматически после обработки.
          </div>
        </div>
      ) : (
        <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Заказчик</th>
                <th style={{ width: 100, textAlign: "center" }}>Касаний</th>
                <th style={{ width: 130, textAlign: "center" }}>Настроение</th>
                <th style={{ width: 130 }}>Последнее</th>
                <th style={{ width: 120, textAlign: "center" }}>Сигналы</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.phone}>
                  <td>
                    <Link href={`/clients/${c.phone}`} style={{ color: "var(--primary)", fontWeight: 600 }}>
                      <span className="pii">{c.name || c.display_phone || c.phone}</span>
                    </Link>
                    {c.name && (
                      <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 11 }}>
                        <span className="pii">{c.display_phone}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{c.total_count}</td>
                  <td style={{ textAlign: "center" }}>
                    <SentimentMini pos={c.positive} neu={c.neutral} neg={c.negative} />
                  </td>
                  <td className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
                    {formatRelative(c.last_at)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {c.loose_threads > 0 ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--warning)", fontWeight: 600 }}>
                        <AlertCircle size={12} strokeWidth={2} />
                        {c.loose_threads}
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </>
  );
}

function SentimentMini({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg;
  if (total === 0) return <span style={{ color: "var(--muted-foreground)" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
      {pos > 0 && <span style={{ color: "var(--success)", display: "inline-flex", alignItems: "center", gap: 2 }}><Smile size={11} />{pos}</span>}
      {neu > 0 && <span style={{ color: "var(--muted-foreground)", display: "inline-flex", alignItems: "center", gap: 2 }}><Meh size={11} />{neu}</span>}
      {neg > 0 && <span style={{ color: "var(--destructive)", display: "inline-flex", alignItems: "center", gap: 2 }}><Frown size={11} />{neg}</span>}
    </span>
  );
}

function formatRelative(s: string | null): string {
  if (!s) return "—";
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "сегодня";
  if (days < 2) return "вчера";
  if (days < 7) return `${days} дней назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  if (days < 365) return `${Math.floor(days / 30)} мес. назад`;
  return `${Math.floor(days / 365)} г. назад`;
}
