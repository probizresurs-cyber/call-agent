/**
 * Динамика по менеджерам — «учатся / не учатся».
 *
 * По каждому менеджеру строим траекторию выполнения чек-листа по НЕДЕЛЯМ и
 * сравниваем раннюю половину периода с недавней: растёт ли общий балл и какие
 * конкретные навыки улучшились / застряли. Это ответ РОПу на вопрос
 * «просили закреплять дату — стало лучше?».
 *
 * Данные: analyses.checklist_scores_json ([{id,title,score 0..1,...}]) + calls
 * (manager_id, started_at). Бакетим по ISO-неделе в JS (db-compat + JSON проще так).
 */
import { getDbAsync } from "./db-compat";

/**
 * Релевантен ли пункт чек-листа. Аналитик ставит нерелевантным пунктам score=1
 * с пометкой «нерелевантно…», из-за чего короткие no-contact звонки давали 100%
 * и ложно «завышали» ранний период. Такие пункты в расчёт НЕ берём.
 */
function isRelevant(it: { notes?: string }): boolean {
  const n = (it.notes || "").toLowerCase();
  return !/нерелеван|неприменим|не примен|not applicable|\bn\/?a\b/.test(n);
}

interface ScoreItem { id?: string; title?: string; score?: number; notes?: string }
interface CallRow { manager_id: string | number | null; manager_name: string | null; started_at: string; checklist_scores_json: string | null }

export type Trend = "up" | "down" | "flat";

export interface SkillDelta {
  title: string;
  early: number;   // средний балл в ранней половине (0..1)
  recent: number;  // средний балл в недавней половине (0..1)
  delta: number;   // recent - early
  count: number;   // сколько звонков учтено
}

export interface ManagerDynamics {
  managerId: string;
  name: string;
  calls: number;
  weeks: { week: string; compliance: number; calls: number }[]; // по возрастанию даты
  earlyCompliance: number;
  recentCompliance: number;
  trend: Trend;
  verdict: "growing" | "stuck" | "declining" | "insufficient";
  improved: SkillDelta[];  // топ выросших навыков (учится)
  regressed: SkillDelta[]; // топ просевших / застрявших низко
}

/** Понедельник недели для даты YYYY-MM-DD (ключ недельного бакета). */
function weekKey(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=вс..6=сб
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export async function getTeamDynamics(tenantId: number, weeks = 8): Promise<ManagerDynamics[]> {
  const db = getDbAsync();

  // Границы периода: [сегодня - weeks*7 ; сегодня]. Будущие даты (битые) отсекаем.
  const today = new Date();
  const toStr = today.toISOString().slice(0, 10);
  const fromD = new Date(today);
  fromD.setUTCDate(fromD.getUTCDate() - weeks * 7);
  const fromStr = fromD.toISOString().slice(0, 10);

  const rows = await db
    .prepare(
      `SELECT c.manager_id, c.manager_name, c.started_at::text AS started_at, a.checklist_scores_json
       FROM analyses a
       JOIN calls c ON c.id = a.call_id
       WHERE c.tenant_id = ?
         AND a.checklist_scores_json IS NOT NULL
         AND a.checklist_scores_json <> '[]'
         AND substr(c.started_at::text, 1, 10) >= ?
         AND substr(c.started_at::text, 1, 10) <= ?`
    )
    .all<CallRow>(tenantId, fromStr, toStr);

  // Имена менеджеров (справочник managers.id → name; но приоритет — calls.manager_name)
  const nameRows = await db
    .prepare(`SELECT id, name FROM managers WHERE tenant_id = ?`)
    .all<{ id: string | number; name: string | null }>(tenantId)
    .catch(() => [] as { id: string | number; name: string | null }[]);
  const nameMap = new Map(nameRows.map((r) => [String(r.id), r.name || ""]));
  const nameFromCalls = new Map<string, string>();

  // Исключённые из отчётов (директор и пр.) — не показываем в динамике.
  const exclRows = await db
    .prepare(`SELECT id FROM managers WHERE tenant_id = ? AND excluded_from_reports = true`)
    .all<{ id: string | number }>(tenantId)
    .catch(() => [] as { id: string | number }[]);
  const excluded = new Set(exclRows.map((r) => String(r.id)));

  // Группируем звонки по менеджеру
  const byMgr = new Map<string, { date: string; compliance: number; items: ScoreItem[] }[]>();
  for (const r of rows) {
    const mid = r.manager_id == null ? "" : String(r.manager_id);
    if (!mid) continue;
    if (r.manager_name && !nameFromCalls.has(mid)) nameFromCalls.set(mid, r.manager_name);
    let items: ScoreItem[];
    try { items = JSON.parse(r.checklist_scores_json || "[]"); } catch { continue; }
    if (!Array.isArray(items) || !items.length) continue;
    const scores = items.filter((it) => typeof it.score === "number" && isRelevant(it)).map((it) => Math.max(0, Math.min(1, Number(it.score))));
    if (!scores.length) continue;
    const date = r.started_at.slice(0, 10);
    const arr = byMgr.get(mid) ?? [];
    arr.push({ date, compliance: mean(scores), items });
    byMgr.set(mid, arr);
  }

  const result: ManagerDynamics[] = [];
  for (const [mid, calls] of byMgr) {
    if (excluded.has(mid)) continue; // исключён из отчётов (напр. директор)
    if (calls.length < 10) continue; // мало данных — пропускаем

    calls.sort((a, b) => a.date.localeCompare(b.date));

    // Ранняя vs недавняя половина (по звонкам, хронологически)
    const mid1 = Math.floor(calls.length / 2);
    const earlyCalls = calls.slice(0, mid1);
    const recentCalls = calls.slice(mid1);

    // Динамика по навыкам: avg по каждому title в ранней и недавней половине
    const skillEarly = new Map<string, number[]>();
    const skillRecent = new Map<string, number[]>();
    const collect = (list: typeof calls, target: Map<string, number[]>) => {
      for (const c of list) {
        for (const it of c.items) {
          if (!it.title || typeof it.score !== "number" || !isRelevant(it)) continue;
          const a = target.get(it.title) ?? [];
          a.push(Math.max(0, Math.min(1, Number(it.score))));
          target.set(it.title, a);
        }
      }
    };
    collect(earlyCalls, skillEarly);
    collect(recentCalls, skillRecent);

    const deltas: SkillDelta[] = [];
    for (const [title, recentArr] of skillRecent) {
      const earlyArr = skillEarly.get(title) ?? [];
      if (earlyArr.length < 3 || recentArr.length < 3) continue;
      const early = mean(earlyArr);
      const recent = mean(recentArr);
      deltas.push({ title, early, recent, delta: recent - early, count: earlyArr.length + recentArr.length });
    }
    const improved = deltas.filter((d) => d.delta > 0.05).sort((a, b) => b.delta - a.delta).slice(0, 3);
    // «Застрявшие» — низкие И не выросли (delta ≤ 0.05), сортируем по низкому недавнему баллу
    const regressed = deltas.filter((d) => d.recent < 0.6 && d.delta <= 0.05).sort((a, b) => a.recent - b.recent).slice(0, 3);

    // Общий балл и недельный тренд — по ОБЩИМ пунктам (что есть в обеих половинах),
    // иначе расширение чек-листа со временем ложно занижает недавнюю половину.
    const commonTitles = new Set(deltas.map((d) => d.title));
    const callScore = (c: { items: ScoreItem[]; compliance: number }): number => {
      const rel = c.items.filter((it) => it.title && commonTitles.has(it.title) && typeof it.score === "number" && isRelevant(it));
      if (!rel.length) return c.compliance; // фолбэк — балл по всем пунктам звонка
      return mean(rel.map((it) => Math.max(0, Math.min(1, Number(it.score)))));
    };

    // Недельные бакеты (по общим пунктам, чтобы спарклайн совпадал с вердиктом)
    const weekAgg = new Map<string, number[]>();
    for (const c of calls) {
      const wk = weekKey(c.date);
      const a = weekAgg.get(wk) ?? [];
      a.push(callScore(c));
      weekAgg.set(wk, a);
    }
    const weekList = Array.from(weekAgg.entries())
      .map(([week, arr]) => ({ week, compliance: mean(arr), calls: arr.length }))
      .sort((a, b) => a.week.localeCompare(b.week));

    const earlyCompliance = deltas.length >= 3 ? mean(deltas.map((d) => d.early)) : mean(earlyCalls.map(callScore));
    const recentCompliance = deltas.length >= 3 ? mean(deltas.map((d) => d.recent)) : mean(recentCalls.map(callScore));
    const diff = recentCompliance - earlyCompliance;
    const trend: Trend = diff > 0.03 ? "up" : diff < -0.03 ? "down" : "flat";

    const verdict: ManagerDynamics["verdict"] =
      weekList.length < 2 ? "insufficient" : trend === "up" ? "growing" : trend === "down" ? "declining" : "stuck";

    result.push({
      managerId: mid,
      name: nameFromCalls.get(mid) || nameMap.get(mid) || `ID ${mid}`,
      calls: calls.length,
      weeks: weekList,
      earlyCompliance,
      recentCompliance,
      trend,
      verdict,
      improved,
      regressed,
    });
  }

  // Сортировка: сначала растущие (интересно похвалить), потом просевшие/застрявшие
  result.sort((a, b) => b.calls - a.calls);
  return result;
}
