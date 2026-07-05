import { redirect } from "next/navigation";
import { getSessionUser, canViewTeam } from "@/lib/auth";
import { getDbAsync } from "@/lib/db-compat";
import { MessageSquare, ChevronDown } from "lucide-react";
import { ObjectionsFilter } from "./ObjectionsFilter";
import { ReclusterButton } from "./ReclusterButton";
import { getClusterMap } from "@/lib/objection-clusters";

export const dynamic = "force-dynamic";

/**
 * Библиотека возражений. Если посчитаны семантические категории (AI) — показываем
 * по КАТЕГОРИЯМ (Цена/дорого …) с раскрытием на формулировки и звонки. Иначе —
 * сырые формулировки со склейкой по нормализации. Фильтр периода, гейт canViewTeam.
 */
function normKey(s: string): string {
  return s.toLowerCase().trim().replace(/[«»"'`]/g, "").replace(/\s+/g, " ").replace(/[.!?,;:—-]+$/g, "").trim();
}

interface Group { display: string; count: number; callIds: number[]; phrases?: { text: string; count: number }[] }

export default async function ObjectionsPage(props: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canViewTeam(me.role)) redirect("/dashboard");
  const sp = await props.searchParams;

  const clauses = ["c.tenant_id = ?", "a.objections_json IS NOT NULL", "a.objections_json <> ''", "a.objections_json <> '[]'"];
  const params: unknown[] = [me.tenantId];
  if (sp.from) { clauses.push("substr(c.started_at::text,1,10) >= ?"); params.push(sp.from); }
  if (sp.to) { clauses.push("substr(c.started_at::text,1,10) <= ?"); params.push(sp.to); }

  const db = getDbAsync();
  const [rows, cluster] = await Promise.all([
    db.prepare(`SELECT c.id AS call_id, a.objections_json FROM analyses a JOIN calls c ON c.id = a.call_id WHERE ${clauses.join(" AND ")}`)
      .all<{ call_id: number; objections_json: string }>(...params),
    getClusterMap(me.tenantId),
  ]);
  const clustered = !!cluster && Object.keys(cluster.map).length > 0;

  // Ключ группировки: категория (если есть кластеры) или нормализованная форма.
  const groups = new Map<string, { count: number; forms: Map<string, number>; callIds: Set<number> }>();
  let total = 0;
  const callsWith = new Set<number>();
  for (const r of rows) {
    let arr: unknown;
    try { arr = JSON.parse(r.objections_json); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    let had = false;
    for (const o of arr) {
      const raw = String(o).trim();
      if (!raw) continue;
      const key = clustered ? (cluster!.map[raw] || "Прочее") : normKey(raw);
      if (!key) continue;
      const g = groups.get(key) ?? { count: 0, forms: new Map(), callIds: new Set() };
      g.count++;
      g.forms.set(raw, (g.forms.get(raw) ?? 0) + 1);
      if (g.callIds.size < 40) g.callIds.add(r.call_id);
      groups.set(key, g);
      total++; had = true;
    }
    if (had) callsWith.add(r.call_id);
  }

  const top: Group[] = [...groups.entries()]
    .map(([key, g]) => ({
      display: clustered ? key : [...g.forms.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: g.count,
      callIds: [...g.callIds],
      phrases: clustered ? [...g.forms.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 8) : undefined,
    }))
    .sort((a, b) => {
      // «Прочее» — всегда в конце, остальное по убыванию частоты
      const ap = a.display === "Прочее" ? 1 : 0, bp = b.display === "Прочее" ? 1 : 0;
      return ap !== bp ? ap - bp : b.count - a.count;
    })
    .slice(0, 60);
  const maxCnt = top[0]?.count ?? 1;

  const stat = (label: string, value: number | string) => (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", flex: "1 1 140px" }}>
      <div className="ds-caption" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );

  return (
    <main style={{ padding: "clamp(16px, 3vw, 32px)", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 className="ds-h2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MessageSquare size={22} color="var(--primary)" /> Библиотека возражений
        </h1>
        <ReclusterButton hasClusters={clustered} />
      </div>
      <p className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginBottom: 16 }}>
        {clustered
          ? "Возражения сгруппированы по смыслу. Кликните категорию — увидите формулировки и звонки."
          : "Топ-барьеров из звонков. Кликните «Сгруппировать по смыслу (AI)», чтобы схлопнуть похожие (Цена/Дорого/Высокая стоимость)."}
      </p>

      <ObjectionsFilter />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {stat("Всего возражений", total)}
        {stat(clustered ? "Категорий" : "Уникальных тем", groups.size)}
        {stat("Звонков с возражениями", callsWith.size)}
      </div>

      {top.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--muted-foreground)" }} className="ds-body-sm">
          Возражений за выбранный период нет.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {top.map((g, i) => (
            <details key={i} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px" }}>
              <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, cursor: "pointer", listStyle: "none" }}>
                <div className="ds-body-sm" style={{ lineHeight: 1.45, display: "flex", gap: 8, fontWeight: clustered ? 600 : 400 }}>
                  <ChevronDown size={15} style={{ flexShrink: 0, marginTop: 2, color: "var(--muted-foreground)" }} />
                  <span><span style={{ color: "var(--muted-foreground)", marginRight: 6, fontVariantNumeric: "tabular-nums" }}>{i + 1}.</span>{g.display}</span>
                </div>
                <div style={{ flexShrink: 0, fontWeight: 800, color: "var(--primary)", fontVariantNumeric: "tabular-nums" }}>{g.count}</div>
              </summary>
              <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: "color-mix(in oklch, var(--primary) 12%, transparent)" }}>
                <div style={{ height: "100%", borderRadius: 4, background: "var(--primary)", width: `${Math.max(6, (g.count / maxCnt) * 100)}%` }} />
              </div>
              {g.phrases && g.phrases.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Формулировки:</span>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {g.phrases.map((p, j) => (
                      <li key={j} className="ds-body-sm" style={{ fontSize: 13, lineHeight: 1.5 }}>{p.text} <span style={{ color: "var(--muted-foreground)" }}>· {p.count}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12, marginRight: 4 }}>Звонки:</span>
                {g.callIds.map((cid) => (
                  <a key={cid} href={`/call-agent/calls/${cid}`}
                     style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6, background: "var(--accent)", color: "var(--primary)", textDecoration: "none" }}>
                    #{cid}
                  </a>
                ))}
                {g.count > g.callIds.length && (
                  <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>+ ещё</span>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
