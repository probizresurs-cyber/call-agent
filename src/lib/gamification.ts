/**
 * §5.4 MASTER-TZ — геймификация v1.
 *
 * Что измеряем:
 *   - leaderboard: топ-N менеджеров за период с формулой score = avg_manager_score * 10 + done_count
 *   - streaks: подряд дней с ≥ 1 done-звонком и средним score ≥ 6.0
 *   - achievements: статические бэйджи (первые 10 звонков, неделя со средней 8+, и т.д.)
 *   - weekly challenge: целевое число done-звонков за неделю на тенант
 *
 * Принцип ТЗ: «завязывать на качество, а не только на количество — чтобы не провоцировать накрутку».
 * Поэтому в score не COUNT(*), а смесь количества и средней оценки.
 */
import { getDbAsync } from "./db-compat";

export interface LeaderRow {
  rank: number;
  manager_id: string;
  manager_name: string;
  done_count: number;
  avg_score: number | null;
  avg_compliance: number | null;
  positive_share: number;     // 0..1
  score: number;              // итоговый рейтинг
  is_me?: boolean;
}

export interface ManagerStreak {
  current_streak: number;     // подряд дней с good day
  longest_streak: number;     // рекорд за всё время
  last_active_date: string | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  progress?: number;          // 0..1 если не достигнуто
  earnedAt?: string;
}

export interface WeeklyChallenge {
  goal: number;
  current: number;
  weekStart: string;
  pct: number;
}

const GOOD_SCORE = 6.0;

// ───────── Leaderboard ─────────

/**
 * Лидерборд за последние 30 дней.
 * Формула: score = avg_score * 10 + done_count + positive_share * 20
 * — позволяет хорошему стабильному менеджеру обогнать «много звонков но низкая оценка».
 */
export async function getLeaderboard(opts: {
  tenantId: number;
  myManagerId?: string | null;   // чтобы пометить is_me
  anonymize?: boolean;            // true для роли manager — заменяем имена на «Менеджер #N»
  daysBack?: number;
}): Promise<LeaderRow[]> {
  const db = getDbAsync();
  const days = opts.daysBack ?? 30;

  const rows = await db
    .prepare(
      `SELECT
         c.manager_id,
         MAX(COALESCE(c.manager_name, '')) AS manager_name,
         SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) AS done_count,
         AVG(a.manager_score) AS avg_score,
         AVG(a.script_compliance) AS avg_compliance,
         SUM(CASE WHEN a.sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
         COUNT(a.call_id) AS analysed_count
       FROM calls c
       LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.tenant_id = ?
         AND c.manager_id IS NOT NULL AND c.manager_id != ''
         AND substr(c.started_at, 1, 10) >= date('now', '-${days} day')
       GROUP BY c.manager_id
       HAVING SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) >= 3`
    )
    .all<{
      manager_id: string; manager_name: string;
      done_count: number; avg_score: number | null; avg_compliance: number | null;
      positive: number; analysed_count: number;
    }>(opts.tenantId);

  const scored = rows.map((r) => {
    const positiveShare = r.analysed_count > 0 ? Number(r.positive) / Number(r.analysed_count) : 0;
    const score = (Number(r.avg_score ?? 0) * 10) + Number(r.done_count) + positiveShare * 20;
    return {
      manager_id: r.manager_id,
      manager_name: r.manager_name || `ID ${r.manager_id}`,
      done_count: Number(r.done_count),
      avg_score: r.avg_score != null ? Number(r.avg_score) : null,
      avg_compliance: r.avg_compliance != null ? Number(r.avg_compliance) : null,
      positive_share: positiveShare,
      score: Math.round(score * 10) / 10,
    };
  }).sort((a, b) => b.score - a.score);

  return scored.map((r, idx) => ({
    rank: idx + 1,
    manager_id: r.manager_id,
    manager_name: opts.anonymize && r.manager_id !== opts.myManagerId
      ? `Менеджер #${idx + 1}`
      : r.manager_name,
    done_count: r.done_count,
    avg_score: r.avg_score,
    avg_compliance: r.avg_compliance,
    positive_share: r.positive_share,
    score: r.score,
    is_me: r.manager_id === opts.myManagerId,
  }));
}

// ───────── Streaks ─────────

/**
 * Подряд дней с good day (≥1 done-звонок И средняя оценка ≥ 6).
 * Считаем за последние 90 дней — достаточно для UI.
 */
export async function getManagerStreak(opts: {
  tenantId: number;
  bitrixManagerId: string;
}): Promise<ManagerStreak> {
  const db = getDbAsync();
  const rows = await db
    .prepare(
      `SELECT substr(c.started_at, 1, 10) AS day,
              SUM(CASE WHEN c.status='done' THEN 1 ELSE 0 END) AS done_count,
              AVG(a.manager_score) AS avg_score
       FROM calls c
       LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.tenant_id = ? AND c.manager_id = ?
         AND substr(c.started_at, 1, 10) >= date('now', '-90 day')
       GROUP BY day
       ORDER BY day DESC`
    )
    .all<{ day: string; done_count: number; avg_score: number | null }>(opts.tenantId, opts.bitrixManagerId);

  // Хорошие дни — список ISO YYYY-MM-DD
  const goodDays = new Set(
    rows
      .filter((r) => Number(r.done_count) > 0 && (r.avg_score == null || Number(r.avg_score) >= GOOD_SCORE))
      .map((r) => r.day)
  );

  // Текущий streak — считаем подряд хороших дней начиная с СЕГОДНЯ или ВЧЕРА (выходные допустимы — берём последний day из rows)
  const today = new Date().toISOString().slice(0, 10);
  let current = 0;
  const d = new Date();
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    if (goodDays.has(iso)) {
      current++;
      d.setDate(d.getDate() - 1);
    } else if (current === 0 && iso === today) {
      // Сегодня ещё нет звонков — это норма, начинаем со вчера
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
    if (current > 90) break;  // safety
  }

  // Рекорд — самый длинный непрерывный отрезок
  const sortedDays = Array.from(goodDays).sort();
  let longest = 0, run = 0, prev: Date | null = null;
  for (const iso of sortedDays) {
    const cur = new Date(iso);
    if (prev) {
      const diff = (cur.getTime() - prev.getTime()) / 86400000;
      if (diff === 1) run++; else run = 1;
    } else run = 1;
    if (run > longest) longest = run;
    prev = cur;
  }

  return {
    current_streak: current,
    longest_streak: longest,
    last_active_date: rows[0]?.day ?? null,
  };
}

// ───────── Achievements ─────────

interface AchievementRule {
  id: string;
  title: string;
  description: string;
  check: (stats: ManagerStats) => boolean;
  progress?: (stats: ManagerStats) => number;
}

interface ManagerStats {
  done_count_total: number;
  done_count_last_week: number;
  avg_score_total: number | null;
  avg_score_last_week: number | null;
  positive_count: number;
  current_streak: number;
  longest_streak: number;
}

const ACHIEVEMENTS: AchievementRule[] = [
  {
    id: "first_blood",
    title: "Первый разбор",
    description: "Один проанализированный звонок — добро пожаловать!",
    check: (s) => s.done_count_total >= 1,
  },
  {
    id: "ten_calls",
    title: "Десятка",
    description: "10 проанализированных звонков",
    check: (s) => s.done_count_total >= 10,
    progress: (s) => Math.min(1, s.done_count_total / 10),
  },
  {
    id: "hundred_calls",
    title: "Сотник",
    description: "100 проанализированных звонков",
    check: (s) => s.done_count_total >= 100,
    progress: (s) => Math.min(1, s.done_count_total / 100),
  },
  {
    id: "first_positive",
    title: "Тёплый звонок",
    description: "Первый разговор с позитивным настроением клиента",
    check: (s) => s.positive_count >= 1,
  },
  {
    id: "good_week",
    title: "Хорошая неделя",
    description: "Средняя оценка за последнюю неделю ≥ 8.0",
    check: (s) => (s.avg_score_last_week ?? 0) >= 8.0,
  },
  {
    id: "five_day_streak",
    title: "Серия 5",
    description: "5 дней подряд с хорошим средним",
    check: (s) => s.current_streak >= 5 || s.longest_streak >= 5,
    progress: (s) => Math.min(1, Math.max(s.current_streak, s.longest_streak) / 5),
  },
  {
    id: "month_streak",
    title: "Серия 30",
    description: "30 дней подряд с хорошим средним",
    check: (s) => s.current_streak >= 30 || s.longest_streak >= 30,
    progress: (s) => Math.min(1, Math.max(s.current_streak, s.longest_streak) / 30),
  },
  {
    id: "consistent_pro",
    title: "Стабильный профи",
    description: "Средняя за всё время ≥ 7.5 при 50+ звонках",
    check: (s) => (s.avg_score_total ?? 0) >= 7.5 && s.done_count_total >= 50,
  },
];

export async function getAchievementsFor(opts: {
  tenantId: number;
  bitrixManagerId: string;
}): Promise<Achievement[]> {
  const db = getDbAsync();
  const aggs = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN c.status='done' THEN 1 ELSE 0 END) AS done_total,
         SUM(CASE WHEN c.status='done' AND substr(c.started_at,1,10) >= date('now','-7 day') THEN 1 ELSE 0 END) AS done_week,
         AVG(a.manager_score) AS avg_total,
         AVG(CASE WHEN substr(c.started_at,1,10) >= date('now','-7 day') THEN a.manager_score END) AS avg_week,
         SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END) AS positive_count
       FROM calls c
       LEFT JOIN analyses a ON a.call_id = c.id
       WHERE c.tenant_id = ? AND c.manager_id = ?`
    )
    .get<{
      done_total: number; done_week: number;
      avg_total: number | null; avg_week: number | null;
      positive_count: number;
    }>(opts.tenantId, opts.bitrixManagerId);

  const streak = await getManagerStreak(opts);

  const stats: ManagerStats = {
    done_count_total: Number(aggs?.done_total ?? 0),
    done_count_last_week: Number(aggs?.done_week ?? 0),
    avg_score_total: aggs?.avg_total != null ? Number(aggs.avg_total) : null,
    avg_score_last_week: aggs?.avg_week != null ? Number(aggs.avg_week) : null,
    positive_count: Number(aggs?.positive_count ?? 0),
    current_streak: streak.current_streak,
    longest_streak: streak.longest_streak,
  };

  return ACHIEVEMENTS.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    earned: r.check(stats),
    progress: r.progress ? r.progress(stats) : (r.check(stats) ? 1 : 0),
  }));
}

// ───────── Weekly Challenge ─────────

/**
 * Текущий weekly challenge тенанта.
 * Цель из tenants.settings.weekly_done_goal (default 50).
 * Прогресс — done звонки с понедельника текущей недели.
 */
export async function getWeeklyChallenge(opts: { tenantId: number }): Promise<WeeklyChallenge> {
  const db = getDbAsync();
  const tRow = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(opts.tenantId);
  const settings = parseSettings(tRow?.settings);
  const goal = Number(settings?.weekly_done_goal ?? 50);

  // Понедельник текущей недели
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;  // Mon=0..Sun=6
  const mon = new Date(now);
  mon.setDate(mon.getDate() - dow);
  mon.setHours(0, 0, 0, 0);
  const weekStart = mon.toISOString().slice(0, 10);

  const r = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM calls
       WHERE tenant_id = ? AND status = 'done'
         AND substr(started_at, 1, 10) >= ?`
    )
    .get<{ n: number }>(opts.tenantId, weekStart);

  const current = Number(r?.n ?? 0);
  return {
    goal,
    current,
    weekStart,
    pct: goal > 0 ? Math.min(100, (current / goal) * 100) : 0,
  };
}

function parseSettings(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  }
  return null;
}
