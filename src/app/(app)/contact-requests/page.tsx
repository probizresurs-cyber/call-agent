/**
 * /contact-requests — просмотр заявок с контактной формы лендинга (/about).
 *
 * Server component, read-only. Guard canViewTeam (manager → /dashboard).
 * Читает contact_requests напрямую через getDbAsync. В меню платформы не
 * выводится (как /onboarding-requests) — доступ по прямой ссылке для владельца.
 */
import { redirect } from "next/navigation";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";

export const dynamic = "force-dynamic";

interface ContactRow {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  marketing_consent: number;
  source: string | null;
  status: string;
  created_at: string;
}

function fmtDate(s: string): string {
  // created_at приходит как "YYYY-MM-DD HH:MM:SS" (UTC). Показываем как есть, компактно.
  if (!s) return "";
  return s.replace("T", " ").slice(0, 16);
}

export default async function ContactRequestsPage() {
  const me = await getSessionUser();
  // return перед redirect — чтобы TS сузил me к non-null (next/navigation без типов).
  if (!me) return redirect("/login");
  if (!canViewTeam(me.role)) return redirect("/dashboard");

  const db = getDbAsync();
  let rows: ContactRow[] = [];
  try {
    rows = await db
      .prepare(
        `SELECT id, name, phone, email, message, marketing_consent, source, status, created_at
           FROM contact_requests
          ORDER BY created_at DESC`
      )
      .all<ContactRow>();
  } catch {
    rows = []; // таблицы может ещё не быть — пустое состояние
  }

  return (
    <div style={{ padding: "24px 0", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>Заявки с сайта</h1>
      <p style={{ color: "var(--muted-foreground)", fontSize: 14, margin: "0 0 20px" }}>
        Контактная форма лендинга. Всего: {rows.length}.
      </p>

      {rows.length === 0 ? (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "40px 24px",
            textAlign: "center",
            color: "var(--muted-foreground)",
          }}
        >
          Заявок пока нет.
        </div>
      ) : (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted-foreground)", fontSize: 12.5 }}>
                  <th style={th}>Дата</th>
                  <th style={th}>Имя</th>
                  <th style={th}>Телефон</th>
                  <th style={th}>Email</th>
                  <th style={th}>Сообщение</th>
                  <th style={th}>Рассылка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "var(--muted-foreground)" }}>
                      {fmtDate(r.created_at)}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.name || "—"}</td>
                    <td style={td}>
                      {r.phone ? (
                        <a href={`tel:${r.phone}`} style={linkStyle}>
                          {r.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={td}>
                      {r.email ? (
                        <a href={`mailto:${r.email}`} style={linkStyle}>
                          {r.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ ...td, maxWidth: 320, color: "var(--muted-foreground)" }}>
                      {r.message || "—"}
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {r.marketing_consent ? "да" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "12px 14px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 14px", verticalAlign: "top" };
const linkStyle: React.CSSProperties = { color: "#7c70e0", textDecoration: "none", fontWeight: 600 };
