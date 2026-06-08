/**
 * Все секции дашборда — KPI, менеджеры, динамика, настроение, слабые места,
 * возражения, темы, продукты. Используется и в /dashboard (private) и в
 * /public/dashboard/[token] (public).
 *
 * Server component. Принимает данные от loadDashboardData и опции рендера.
 */
import {
  Phone, CheckCircle2, XCircle, CircleDot, Clock, AlertTriangle,
  Star, ClipboardList, MessageSquare, Tag, Timer, ArrowDownLeft,
  TrendingUp, AlertOctagon, Users, FileX, Package, ListChecks, ChevronDown, type LucideIcon,
} from "lucide-react";
import type { DashboardData } from "@/lib/dashboard-data";

export interface DashboardSectionsProps {
  data: DashboardData;
  /**
   * Режим:
   *   - 'private' — для роли head/owner/admin (с блоком «Менеджеры»)
   *   - 'manager' — для роли manager (без блока «Менеджеры», без некоторых деталей)
   *   - 'public' — публичный read-only (без ссылки в Настройки)
   */
  mode: "private" | "manager" | "public";
}

export function DashboardSections({ data, mode }: DashboardSectionsProps) {
  const {
    contactThreshold, totals, aggs, sentMap, sentTotal,
    allManagers, series, maxDaily, topObjections, topTopics,
    productStats, checklistStats, checklistItemsBreakdown, selectedManagerName,
  } = data;

  const showManagersTable = mode !== "manager";

  return (
    <>
      {/* ───── KPI ───── */}
      <div className="kpi-grid-5" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 16 }}>
        <Kpi icon={Phone} label="Всего звонков" value={String(totals.total)} />
        <Kpi icon={CheckCircle2} label="Проанализировано" value={String(totals.done)} color="var(--success)" />
        <Kpi icon={Clock} label="В обработке" value={String(totals.in_progress)} color="var(--primary)" />
        <Kpi icon={FileX} label="Без записи" value={String(totals.no_recording)} color="var(--warning)" />
        <Kpi icon={AlertTriangle} label="Ошибки" value={String(totals.failed)} color="var(--destructive)" />
      </div>

      <div className="kpi-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        <Kpi icon={Star} label="Ср. оценка" value={aggs.avg_score != null ? `${aggs.avg_score.toFixed(1)} / 10` : "—"} color="var(--warning)" />
        <Kpi icon={ClipboardList} label="Ср. чек-лист" value={aggs.avg_compliance != null ? `${Math.round(aggs.avg_compliance * 100)}%` : "—"} color="var(--primary)" />
        <Kpi icon={Timer} label="Ср. длительность" value={formatDuration(totals.avg_duration)} />
        <Kpi icon={ArrowDownLeft} label="Вход. / Исход." value={`${totals.incoming} / ${totals.outgoing}`} />
      </div>

      {/* ───── Менеджеры — детальная статистика ───── */}
      {showManagersTable && (
        <div className="ds-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="ds-h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={16} strokeWidth={2} /> Менеджеры — детальная статистика
            </h2>
            <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
              всего: {allManagers.length}
            </span>
          </div>
          {allManagers.length === 0 ? <Empty /> : (
            <div style={{ overflowX: "auto" }}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>ФИО / ID</th>
                    <th style={{ width: 80, textAlign: "center" }}>Всего</th>
                    <th style={{ width: 100, textAlign: "center" }}>Минут</th>
                    <th style={{ width: 110, textAlign: "center" }}>Контактов*</th>
                    <th style={{ width: 110, textAlign: "center" }}>Мин. на контактах</th>
                    <th style={{ width: 80, textAlign: "center" }}>Вход.</th>
                    <th style={{ width: 80, textAlign: "center" }}>Исход.</th>
                    <th style={{ width: 100, textAlign: "center" }}>Пропущ.**</th>
                    <th style={{ width: 100 }}>Ср. оценка</th>
                    <th style={{ width: 90 }}>Чек-лист</th>
                    <th style={{ width: 130 }}>Настроение</th>
                  </tr>
                </thead>
                <tbody>
                  {allManagers.map((m) => {
                    const st = m.pos + m.neu + m.neg;
                    return (
                      <tr key={m.manager_id}>
                        <td>{m.manager_name || <span style={{ color: "var(--muted-foreground)" }}>ID {m.manager_id}</span>}</td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>{m.calls}</td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 600 }}>{formatTotalMinutes(m.total_seconds)}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ color: "var(--success)", fontWeight: 600 }}>{m.connected}</span>
                          <span style={{ color: "var(--muted-foreground)", fontSize: 11, marginLeft: 4 }}>
                            ({m.calls > 0 ? Math.round((m.connected / m.calls) * 100) : 0}%)
                          </span>
                        </td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatTotalMinutes(m.contact_seconds)}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>{m.incoming}</td>
                        <td style={{ textAlign: "center" }}>{m.outgoing}</td>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ color: m.missed > 0 ? "var(--destructive)" : "var(--muted-foreground)", fontWeight: 600 }}>
                            {m.missed}
                          </span>
                        </td>
                        <td>
                          {m.avg_score != null ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Star size={12} color="var(--warning)" />{m.avg_score.toFixed(1)}
                            </span>
                          ) : "—"}
                        </td>
                        <td>{m.avg_compliance != null ? `${Math.round(m.avg_compliance * 100)}%` : "—"}</td>
                        <td>{st === 0 ? <span style={{ color: "var(--muted-foreground)" }}>—</span> : <SentimentMini pos={m.pos} neu={m.neu} neg={m.neg} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 10, fontSize: 11 }}>
            * <b>Контактов</b> — звонки длительностью ≥ {contactThreshold} сек (разговор состоялся).<br/>
            ** <b>Пропущ.</b> — входящие звонки на которые не ответили (длительность 0 сек). Совпадает с колонкой «Пропущенные» в Битрикс.<br/>
            <b>Входящ.</b> — входящие на которые ответили. <b>Исходящ.</b> — все исходящие.
          </div>
        </div>
      )}

      {/* ───── Чек-лист: выполнение пунктов (свёрнуто по умолчанию) ───── */}
      <details className="ds-card" style={{ marginBottom: 16, padding: 0 }}>
        <summary style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
          padding: 14, cursor: "pointer", listStyle: "none", userSelect: "none",
        }}>
          <h2 className="ds-h3" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
            <ListChecks size={16} strokeWidth={2} /> Чек-лист — выполнение пунктов
            <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", fontWeight: 400, marginLeft: 6 }}>
              · {selectedManagerName ? `по менеджеру: ${selectedManagerName}` : "по всей команде"}
            </span>
          </h2>
          <span className="ds-body-sm" style={{ color: "var(--muted-foreground)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            пунктов: {checklistItemsBreakdown.length}
            <ChevronDown size={14} className="ds-chevron" />
          </span>
        </summary>
        <div style={{ padding: "0 14px 14px" }}>
          {checklistItemsBreakdown.length === 0 ? (
            <Empty hint="Чек-лист ещё не оценивался" />
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>Пункт чек-листа</th>
                      <th style={{ width: 200 }}>Средний score</th>
                      <th style={{ width: 140, textAlign: "center" }}>% выполнения</th>
                      <th style={{ width: 110, textAlign: "center" }}>Оценок</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklistItemsBreakdown.map((it, idx) => {
                      const isTopProblem = idx < 3;
                      const passPct = Math.round(it.pass_rate * 100);
                      const passColor =
                        passPct >= 80 ? "var(--success)" :
                        passPct >= 40 ? "var(--warning)" : "var(--destructive)";
                      return (
                        <tr
                          key={it.id}
                          style={{
                            background: isTopProblem ? "color-mix(in srgb, var(--destructive) 10%, transparent)" : undefined,
                          }}
                        >
                          <td style={{ fontWeight: isTopProblem ? 600 : 400 }}>
                            {isTopProblem && (
                              <AlertOctagon
                                size={12}
                                color="var(--destructive)"
                                style={{ verticalAlign: "middle", marginRight: 6 }}
                              />
                            )}
                            {it.title}
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <Bar value={it.avg_score} />
                              </div>
                              <span style={{ minWidth: 42, textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                                {Math.round(it.avg_score * 100)}%
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <span style={{ color: passColor, fontWeight: 600 }}>{passPct}%</span>
                          </td>
                          <td style={{ textAlign: "center", color: "var(--muted-foreground)" }}>
                            {it.count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", marginTop: 10, fontSize: 11 }}>
                <b>% выполнения</b> — доля звонков, где пункт оценён ≥ 70% (score &ge; 0.7).
                Top-3 проблемных пунктов подсвечены — туда фокус внимания.
                Сортировка: от худшего к лучшему по % выполнения.
              </div>
            </>
          )}
        </div>
      </details>

      {/* ───── Динамика по дням ───── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={16} strokeWidth={2} /> Динамика за 14 дней
        </h2>
        {totals.total === 0 ? <Empty /> : (
          <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${series.length}, minmax(24px, 1fr))`, gap: 6, alignItems: "end", height: 160, minWidth: series.length > 7 ? series.length * 30 : undefined }}>
            {series.map((s) => {
              const tot = s.positive + s.negative + s.neutral || s.total;
              const hPx = Math.round((s.total / maxDaily) * 130) + 2;
              return (
                <div key={s.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", visibility: s.total ? "visible" : "hidden" }}>{s.total}</div>
                  <div title={`${s.day}: всего ${s.total}, +${s.positive} / ~${s.neutral} / -${s.negative}`}
                       style={{ width: "100%", height: hPx, borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--muted)" }}>
                    {tot > 0 && (<>
                      <div style={{ flex: s.positive, background: "var(--success)" }} />
                      <div style={{ flex: s.neutral, background: "var(--muted-foreground)", opacity: 0.55 }} />
                      <div style={{ flex: s.negative, background: "var(--destructive)" }} />
                    </>)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{s.day.slice(8, 10)}.{s.day.slice(5, 7)}</div>
                </div>
              );
            })}
          </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12 }}>
          <LegendDot color="var(--success)" label="Позитив" />
          <LegendDot color="var(--muted-foreground)" label="Нейтрально" />
          <LegendDot color="var(--destructive)" label="Негатив" />
        </div>
      </div>

      {/* ───── Sentiment + Слабые пункты ───── */}
      {/* auto-fit/minmax → 2 колонки на десктопе, 1 колонка на узких экранах (без media-query) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <CircleDot size={16} strokeWidth={2} /> Настроение заказчиков
          </h2>
          {sentTotal === 0 ? <Empty /> : (<>
            <SentimentBar parts={[
              { label: "Позитив", value: sentMap.positive, color: "var(--success)" },
              { label: "Нейтрально", value: sentMap.neutral, color: "var(--muted-foreground)" },
              { label: "Негатив", value: sentMap.negative, color: "var(--destructive)" },
            ]} />
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted-foreground)" }}>
              <SentRow icon={<CheckCircle2 size={14} color="var(--success)" />} label="Позитивных" value={sentMap.positive} total={sentTotal} />
              <SentRow icon={<CircleDot size={14} />} label="Нейтральных" value={sentMap.neutral} total={sentTotal} />
              <SentRow icon={<XCircle size={14} color="var(--destructive)" />} label="Негативных" value={sentMap.negative} total={sentTotal} />
            </div>
          </>)}
        </div>

        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertOctagon size={16} strokeWidth={2} /> Слабые места в скрипте
          </h2>
          {checklistStats.length === 0 ? <Empty hint="Чек-лист ещё не оценивался" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {checklistStats.slice(0, 6).map((c) => (
                <div key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{c.title}</span>
                    <span style={{ color: "var(--muted-foreground)" }}>{Math.round(c.avg * 100)}% · {c.n} зв.</span>
                  </div>
                  <Bar value={c.avg} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ───── Топ возражений + Топ тем ───── */}
      {/* auto-fit/minmax → 2 колонки на десктопе, 1 колонка на узких экранах (без media-query) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <MessageSquare size={16} strokeWidth={2} /> Топ возражений
          </h2>
          {topObjections.length === 0 ? <Empty /> : (
            <TopList items={topObjections} max={Math.max(...topObjections.map((o) => o.count))} />
          )}
        </div>

        <div className="ds-card">
          <h2 className="ds-h3" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Tag size={16} strokeWidth={2} /> Топ тем
          </h2>
          {topTopics.length === 0 ? <Empty /> : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {topTopics.map((t) => (
                <span key={t.title} className="ds-badge ds-badge-info">
                  {t.title} <b style={{ marginLeft: 4 }}>{t.count}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ───── Распределение по продуктам ───── */}
      <div className="ds-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 className="ds-h3" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={16} strokeWidth={2} /> Распределение по продуктам
          </h2>
          <span className="ds-body-sm" style={{ color: "var(--muted-foreground)" }}>
            AI определяет продукт по содержанию разговора
          </span>
        </div>
        {productStats.length === 0 || (productStats.length === 1 && !productStats[0].product) ? (
          <Empty hint="Скрипты с привязкой к продуктам ещё не настроены или нет проанализированных звонков." />
        ) : (<>
          <ProductBar items={productStats} />
          <div style={{ overflowX: "auto" }}>
            <table className="ds-table" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Продукт</th>
                  <th style={{ width: 90, textAlign: "center" }}>Звонков</th>
                  <th style={{ width: 110, textAlign: "center" }}>Контактов</th>
                  <th style={{ width: 110, textAlign: "center" }}>Минут</th>
                  <th style={{ width: 110 }}>Ср. оценка</th>
                  <th style={{ width: 110 }}>Чек-лист</th>
                  <th style={{ width: 160 }}>Настроение</th>
                </tr>
              </thead>
              <tbody>
                {productStats.map((p) => {
                  const st = p.pos + p.neu + p.neg;
                  return (
                    <tr key={p.product || "unknown"}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: getProductColor(p.product), display: "inline-block" }} />
                          <span style={{ color: !p.product ? "var(--muted-foreground)" : "var(--foreground)", fontWeight: p.product && !p.product.startsWith("__") ? 600 : 400 }}>
                            {productLabel(p.product)}
                          </span>
                        </span>
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 600 }}>{p.calls}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ color: "var(--success)", fontWeight: 600 }}>{p.connected}</span>
                        <span style={{ color: "var(--muted-foreground)", fontSize: 11, marginLeft: 4 }}>
                          ({p.calls > 0 ? Math.round((p.connected / p.calls) * 100) : 0}%)
                        </span>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 600 }}>{formatTotalMinutes(p.total_seconds)}</span>
                      </td>
                      <td>
                        {p.avg_score != null ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Star size={12} color="var(--warning)" />{p.avg_score.toFixed(1)}
                          </span>
                        ) : "—"}
                      </td>
                      <td>{p.avg_compliance != null ? `${Math.round(p.avg_compliance * 100)}%` : "—"}</td>
                      <td>{st === 0 ? <span style={{ color: "var(--muted-foreground)" }}>—</span> : <SentimentMini pos={p.pos} neu={p.neu} neg={p.neg} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </>
  );
}

// ── helpers ──

function Kpi({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string; color?: string }) {
  return (
    <div className="ds-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span className="ds-caption">{label}</span>
        <Icon size={16} strokeWidth={2} color={color || "var(--muted-foreground)"} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "var(--foreground)", lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function SentimentMini({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  const total = pos + neu + neg || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--muted)" }}>
        <div style={{ width: `${(pos / total) * 100}%`, background: "var(--success)" }} />
        <div style={{ width: `${(neu / total) * 100}%`, background: "#a0a0a0" }} />
        <div style={{ width: `${(neg / total) * 100}%`, background: "var(--destructive)" }} />
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 11, marginTop: 4, color: "var(--muted-foreground)" }}>
        <span style={{ color: "var(--success)" }}>+{pos}</span>
        <span>={neu}</span>
        <span style={{ color: "var(--destructive)" }}>-{neg}</span>
      </div>
    </div>
  );
}

function SentimentBar({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--muted)" }}>
      {parts.map((p) => (<div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />))}
    </div>
  );
}

function SentRow({ icon, label, value, total }: { icon: React.ReactNode; label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{icon} {label}</span>
      <span>{value} <span style={{ opacity: 0.6 }}>({pct}%)</span></span>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = pct >= 80 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--destructive)";
  return (
    <div style={{ height: 6, background: "var(--muted)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color }} />
    </div>
  );
}

function TopList({ items, max }: { items: Array<{ title: string; count: number }>; max: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((it) => (
        <div key={it.title} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13 }}>{capitalize(it.title)}</div>
          <div style={{ width: 120, height: 6, background: "var(--muted)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${(it.count / max) * 100}%`, height: "100%", background: "var(--primary)" }} />
          </div>
          <div style={{ minWidth: 26, textAlign: "right", fontSize: 12, fontWeight: 600 }}>{it.count}</div>
        </div>
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
    </span>
  );
}

function Empty({ hint }: { hint?: string } = {}) {
  return (
    <div className="ds-body-sm" style={{ color: "var(--muted-foreground)", padding: "20px 0", textAlign: "center" }}>
      {hint || "Пока данных нет"}
    </div>
  );
}

function ProductBar({ items }: { items: Array<{ product: string | null; calls: number }> }) {
  const total = items.reduce((a, b) => a + b.calls, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "var(--muted)" }}>
        {items.map((p) => (
          <div key={p.product || "unknown"} title={`${p.product || "Не определён"}: ${p.calls} (${Math.round((p.calls / total) * 100)}%)`}
               style={{ width: `${(p.calls / total) * 100}%`, background: getProductColor(p.product) }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", fontSize: 12 }}>
        {items.map((p) => {
          const label = productLabel(p.product);
          return (
            <span key={p.product || "unknown"} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: getProductColor(p.product), display: "inline-block" }} />
              <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
              <b>{p.calls}</b>
              <span style={{ color: "var(--muted-foreground)" }}>({Math.round((p.calls / total) * 100)}%)</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function productLabel(p: string | null): string {
  if (p === "__no_transcript__") return "Без транскрипта";
  if (p === "__no_match__") return "Без темы";
  return p || "Не определён";
}

function getProductColor(product: string | null): string {
  if (!product) return "var(--muted-foreground)";
  const code = product.toUpperCase();
  const colors: Record<string, string> = { "МП": "var(--primary)", "МК": "var(--success)" };
  if (colors[code]) return colors[code];
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 50%)`;
}

function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTotalMinutes(sec: number): string {
  if (!sec) return "—";
  const totalMin = Math.round(sec / 60);
  if (totalMin === 0) return "<1 мин";
  if (totalMin < 60) return `${totalMin} мин`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins ? `${hours} ч ${mins} мин` : `${hours} ч`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
