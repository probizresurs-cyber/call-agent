/**
 * Все SQL-выборки для дашборда — в одном месте, используются и в private
 * (/dashboard) и в public (/public/dashboard/[token]) страницах.
 *
 * Принимает фильтры (tenantId / period / manager / with_crm / managerBitrixId
 * для RLS-режима менеджера) и возвращает структурированные данные.
 */
import { getDbAsync } from "./db-compat";
import { getSetting } from "./db";

const DEFAULT_CONTACT_THRESHOLD = 15;
export type SentimentBucket = "positive" | "neutral" | "negative" | "unknown";

export interface DashboardDataOpts {
  tenantId: number;
  /** ISO YYYY-MM-DD — нижняя граница периода (по started_at) */
  from?: string;
  /** ISO YYYY-MM-DD — верхняя граница */
  to?: string;
  /** Фильтр «только звонки привязанные к Deal/Lead/Contact/Activity в CRM» */
  withCrmOnly?: boolean;
  /** Фильтр по конкретному менеджеру (Bitrix manager_id) */
  managerId?: string;
  /**
   * Если задан — это RLS-режим для роли manager: видит только свои звонки.
   * В этом случае фильтр по managerId игнорируется (RLS уже жёсткая).
   */
  managerBitrixId?: string;
}

export interface DailyRow {
  day: string;
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface ManagerStatsRow {
  manager_id: string;
  manager_name: string;
  calls: number;
  connected: number;
  missed: number;
  total_seconds: number;
  contact_seconds: number;
  incoming: number;
  outgoing: number;
  avg_score: number | null;
  avg_compliance: number | null;
  pos: number;
  neu: number;
  neg: number;
}

export interface ProductStatsRow {
  product: string | null;
  calls: number;
  connected: number;
  missed: number;
  total_seconds: number;
  avg_score: number | null;
  avg_compliance: number | null;
  pos: number;
  neu: number;
  neg: number;
}

export interface DashboardData {
  contactThreshold: number;
  missedThreshold: number;
  totals: {
    total: number; done: number; in_progress: number; failed: number;
    no_recording: number; incoming: number; outgoing: number;
    avg_duration: number; total_duration: number;
  };
  aggs: { avg_score: number | null; avg_compliance: number | null };
  sentMap: Record<SentimentBucket, number>;
  sentTotal: number;
  allManagers: ManagerStatsRow[];
  series: DailyRow[];
  maxDaily: number;
  topObjections: Array<{ title: string; count: number }>;
  topTopics: Array<{ title: string; count: number }>;
  productStats: ProductStatsRow[];
  checklistStats: Array<{ id: string; title: string; avg: number; n: number }>;
  /**
   * Детальный разрез по пунктам чек-листа: средний score, % выполнения
   * (score >= 0.7), кол-во оценок. Учитывает все активные фильтры дашборда
   * (период / менеджер / with_crm). Отсортирован по pass_rate ASC — сверху
   * худшие.
   */
  checklistItemsBreakdown: Array<{
    id: string;
    title: string;
    avg_score: number;
    pass_rate: number;
    count: number;
  }>;
  /** Список менеджеров тенанта — для фильтра. Пустой в RLS-режиме менеджера. */
  managersList: Array<{ id: string; name: string }>;
  /**
   * ФИО менеджера, выбранного фильтром (или RLS-менеджера в режиме manager).
   * `null`, если выбрана вся команда.
   */
  selectedManagerName: string | null;
}

export async function loadDashboardData(opts: DashboardDataOpts): Promise<DashboardData> {
  const db = getDbAsync();
  const contactThreshold = parseInt((await getSetting("contact_threshold_seconds")) || String(DEFAULT_CONTACT_THRESHOLD), 10);
  const missedThreshold = Math.max(5, Math.floor(contactThreshold / 1.5));

  // Базовый WHERE — tenant + дата + менеджер
  const where: string[] = ["c.tenant_id = ?"];
  const params: unknown[] = [opts.tenantId];

  if (opts.managerBitrixId) {
    // RLS для роли manager
    where.push("c.manager_id = ?");
    params.push(opts.managerBitrixId);
  } else if (opts.managerId) {
    // Фильтр по менеджеру для не-manager ролей
    where.push("c.manager_id = ?");
    params.push(opts.managerId);
  }
  if (opts.from) { where.push("substr(c.started_at,1,10) >= ?"); params.push(opts.from); }
  if (opts.to)   { where.push("substr(c.started_at,1,10) <= ?"); params.push(opts.to); }
  if (opts.withCrmOnly) {
    where.push(
      "(c.bitrix_deal_id IS NOT NULL OR c.bitrix_lead_id IS NOT NULL OR c.bitrix_contact_id IS NOT NULL OR (c.bitrix_activity_id IS NOT NULL AND c.bitrix_activity_id != '0'))"
    );
  }
  const periodSql = "WHERE " + where.join(" AND ");
  const andSql = "AND " + where.join(" AND ");

  // ── managersList ── (для не-manager-режима)
  const managersList = opts.managerBitrixId ? [] : await db
    .prepare(
      `SELECT c.manager_id AS id,
              COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name
       FROM calls c
       LEFT JOIN managers m ON m.id = c.manager_id
       WHERE c.tenant_id = ?
         AND c.manager_id IS NOT NULL AND c.manager_id != ''
         AND (m.is_active IS NULL OR m.is_active = 1)
       GROUP BY c.manager_id
       ORDER BY name`
    )
    .all<{ id: string; name: string }>(opts.tenantId);

  // ── KPI ──
  const totals = (await db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN status IN ('pending','downloading','transcribing','analyzing','syncing') THEN 1 ELSE 0 END) AS in_progress,
       SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status='no_recording' THEN 1 ELSE 0 END) AS no_recording,
       SUM(CASE WHEN direction='in' THEN 1 ELSE 0 END) AS incoming,
       SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END) AS outgoing,
       COALESCE(AVG(duration_sec), 0) AS avg_duration,
       COALESCE(SUM(duration_sec), 0) AS total_duration
     FROM calls c
     ${periodSql}`
  ).get<DashboardData["totals"]>(...params))!;

  const aggs = (await db.prepare(
    `SELECT AVG(a.manager_score) AS avg_score, AVG(a.script_compliance) AS avg_compliance
     FROM analyses a JOIN calls c ON c.id = a.call_id
     ${periodSql}`
  ).get<DashboardData["aggs"]>(...params))!;

  // ── Sentiment ──
  const sentiments = await db.prepare(
    `SELECT a.sentiment, COUNT(*) AS n
     FROM analyses a JOIN calls c ON c.id = a.call_id
     ${periodSql}
     GROUP BY a.sentiment`
  ).all<{ sentiment: string; n: number }>(...params);
  const sentMap: Record<SentimentBucket, number> = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
  for (const s of sentiments) sentMap[(s.sentiment as SentimentBucket) || "unknown"] = s.n;
  const sentTotal = sentMap.positive + sentMap.neutral + sentMap.negative;

  // ── Менеджеры — детальная статистика ──
  const allManagers = await db.prepare(
    `SELECT c.manager_id,
            COALESCE(MAX(c.manager_name), MAX(m.name), '') AS manager_name,
            COUNT(*) AS calls,
            SUM(CASE WHEN c.duration_sec >= ${contactThreshold} THEN 1 ELSE 0 END) AS connected,
            COALESCE(SUM(c.duration_sec), 0) AS total_seconds,
            COALESCE(SUM(CASE WHEN c.duration_sec >= ${contactThreshold} THEN c.duration_sec ELSE 0 END), 0) AS contact_seconds,
            SUM(CASE WHEN c.direction='in' AND c.duration_sec = 0 THEN 1 ELSE 0 END) AS missed,
            SUM(CASE WHEN c.direction='in' AND c.duration_sec > 0 THEN 1 ELSE 0 END) AS incoming,
            SUM(CASE WHEN c.direction='out' THEN 1 ELSE 0 END) AS outgoing,
            AVG(a.manager_score) AS avg_score,
            AVG(a.script_compliance) AS avg_compliance,
            SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END) AS pos,
            SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END) AS neu,
            SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END) AS neg
     FROM calls c
     LEFT JOIN analyses a ON a.call_id = c.id
     LEFT JOIN managers m ON m.id = c.manager_id
     WHERE c.manager_id IS NOT NULL AND c.manager_id != ''
       AND (m.is_active IS NULL OR m.is_active = 1)
       ${andSql}
     GROUP BY c.manager_id
     ORDER BY calls DESC`
  ).all<ManagerStatsRow>(...params);

  // ── Динамика по дням (14) ──
  const daily = await db.prepare(
    `SELECT substr(c.started_at, 1, 10) AS day,
            COUNT(*) AS total,
            SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END) AS positive,
            SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END) AS negative,
            SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END) AS neutral
     FROM calls c LEFT JOIN analyses a ON a.call_id = c.id
     WHERE c.started_at IS NOT NULL
       AND substr(c.started_at,1,10) >= date('now','-13 day')
       ${andSql}
     GROUP BY day ORDER BY day ASC`
  ).all<DailyRow>(...params);

  const series: DailyRow[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const row = daily.find((r) => r.day === ds);
    series.push(row ?? { day: ds, total: 0, positive: 0, negative: 0, neutral: 0 });
  }
  const maxDaily = Math.max(1, ...series.map((s) => s.total));

  // ── Топ возражений ──
  const rawObj = await db.prepare(
    `SELECT a.objections_json FROM analyses a JOIN calls c ON c.id = a.call_id
     WHERE a.objections_json IS NOT NULL ${andSql}`
  ).all<{ objections_json: string }>(...params);
  const objCount = new Map<string, number>();
  for (const r of rawObj) {
    try {
      const arr = JSON.parse(r.objections_json) as string[];
      for (const o of arr || []) {
        const k = o.trim().toLowerCase();
        if (!k) continue;
        objCount.set(k, (objCount.get(k) || 0) + 1);
      }
    } catch {}
  }
  const topObjections = [...objCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([title, count]) => ({ title, count }));

  // ── Топ тем ──
  const rawTopics = await db.prepare(
    `SELECT a.topics_json FROM analyses a JOIN calls c ON c.id = a.call_id
     WHERE a.topics_json IS NOT NULL ${andSql}`
  ).all<{ topics_json: string }>(...params);
  const topicCount = new Map<string, number>();
  for (const r of rawTopics) {
    try {
      const arr = JSON.parse(r.topics_json) as string[];
      for (const t of arr || []) {
        const k = t.trim().toLowerCase();
        if (!k) continue;
        topicCount.set(k, (topicCount.get(k) || 0) + 1);
      }
    } catch {}
  }
  const topTopics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([title, count]) => ({ title, count }));

  // ── Распределение по продуктам ──
  const productStats = await db.prepare(
    `SELECT sub.product, sub.calls, sub.connected, sub.missed, sub.total_seconds,
            sub.avg_score, sub.avg_compliance, sub.pos, sub.neu, sub.neg
     FROM (
       SELECT
         CASE
           WHEN COALESCE(NULLIF(c.detected_product,''), NULLIF(a.detected_product,'')) IS NOT NULL
             THEN COALESCE(NULLIF(c.detected_product,''), NULLIF(a.detected_product,''))
           WHEN c.id IN (SELECT call_id FROM transcripts WHERE text IS NOT NULL AND text != '')
             THEN '__no_match__'
           ELSE '__no_transcript__'
         END AS product,
         COUNT(*) AS calls,
         SUM(CASE WHEN c.duration_sec >= ${contactThreshold} THEN 1 ELSE 0 END) AS connected,
         SUM(CASE WHEN c.duration_sec < ${missedThreshold} THEN 1 ELSE 0 END) AS missed,
         COALESCE(SUM(c.duration_sec), 0) AS total_seconds,
         AVG(a.manager_score) AS avg_score,
         AVG(a.script_compliance) AS avg_compliance,
         SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END) AS pos,
         SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END) AS neu,
         SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END) AS neg
       FROM calls c
       LEFT JOIN analyses a ON a.call_id = c.id
       LEFT JOIN managers m ON m.id = c.manager_id
       WHERE (m.is_active IS NULL OR m.is_active = 1)
         ${andSql}
       GROUP BY 1
     ) sub
     ORDER BY
       CASE WHEN sub.product = '__no_transcript__' THEN 2 WHEN sub.product = '__no_match__' THEN 1 ELSE 0 END,
       sub.calls DESC`
  ).all<ProductStatsRow>(...params);

  // ── Чек-лист: агрегация по пунктам (id+title → avg score, pass_rate, n) ──
  // SQL уже учитывает все фильтры дашборда через andSql (включая managerId).
  // Поэтому когда выбран менеджер — статистика считается только по его звонкам.
  const rawChecklist = await db.prepare(
    `SELECT a.checklist_scores_json FROM analyses a JOIN calls c ON c.id = a.call_id
     WHERE a.checklist_scores_json IS NOT NULL ${andSql}`
  ).all<{ checklist_scores_json: string }>(...params);
  const PASS_THRESHOLD = 0.7;
  const itemStats = new Map<string, { title: string; sum: number; n: number; passed: number }>();
  for (const r of rawChecklist) {
    try {
      const arr = JSON.parse(r.checklist_scores_json) as Array<{ id: string; title: string; score: number }>;
      for (const it of arr || []) {
        const key = it.id || it.title;
        if (!key) continue;
        const cur = itemStats.get(key) ?? { title: it.title || key, sum: 0, n: 0, passed: 0 };
        cur.sum += it.score;
        cur.n += 1;
        if (it.score >= PASS_THRESHOLD) cur.passed += 1;
        itemStats.set(key, cur);
      }
    } catch {}
  }
  const checklistStats = [...itemStats.entries()]
    .map(([id, s]) => ({ id, title: s.title, avg: s.n ? s.sum / s.n : 0, n: s.n }))
    .sort((a, b) => a.avg - b.avg);
  // Детальный разрез — отдельный массив с pass_rate, отсортированный по нему ASC
  const checklistItemsBreakdown = [...itemStats.entries()]
    .map(([id, s]) => ({
      id,
      title: s.title,
      avg_score: s.n ? s.sum / s.n : 0,
      pass_rate: s.n ? s.passed / s.n : 0,
      count: s.n,
    }))
    .sort((a, b) => a.pass_rate - b.pass_rate);

  // ── Имя выбранного менеджера (для подзаголовков блоков) ──
  let selectedManagerName: string | null = null;
  const selectedMgrId = opts.managerBitrixId || opts.managerId;
  if (selectedMgrId) {
    const row = await db.prepare(
      `SELECT COALESCE(MAX(c.manager_name), MAX(m.name), '') AS name
       FROM calls c
       LEFT JOIN managers m ON m.id = c.manager_id
       WHERE c.tenant_id = ? AND c.manager_id = ?`
    ).get<{ name: string }>(opts.tenantId, selectedMgrId);
    selectedManagerName = (row?.name && row.name.trim()) || `ID ${selectedMgrId}`;
  }

  return {
    contactThreshold,
    missedThreshold,
    totals,
    aggs,
    sentMap,
    sentTotal,
    allManagers,
    series,
    maxDaily,
    topObjections,
    topTopics,
    productStats,
    checklistStats,
    checklistItemsBreakdown,
    managersList,
    selectedManagerName,
  };
}
