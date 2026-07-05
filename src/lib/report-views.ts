/**
 * Журнал просмотров публичного отчёта (ссылка руководителю).
 *
 * Каждый заход на /public/dashboard/[token] клиентский трекер шлёт POST на
 * /api/public/report-view — тут пишем строку (с троттлингом 10 мин на зрителя,
 * чтобы автообновление не раздувало счётчик). Владелец видит сводку в попапе
 * «Поделиться»: сколько заходов, последний визит, регулярность, недавние заходы.
 *
 * Таблица создаётся лениво (CREATE TABLE IF NOT EXISTS) — как crm-log/budget.
 */
import { getDbAsync } from "./db-compat";

let _tableReady = false;

async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  const db = getDbAsync();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ca_report_views (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      viewer_id TEXT,
      kind VARCHAR(16) NOT NULL DEFAULT 'dashboard',
      ip TEXT,
      user_agent TEXT,
      viewed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ca_report_views_tenant_idx ON ca_report_views(tenant_id, viewed_at);
    CREATE INDEX IF NOT EXISTS ca_report_views_viewer_idx ON ca_report_views(viewer_id, viewed_at);
  `).catch(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ca_report_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        viewer_id TEXT,
        kind TEXT NOT NULL DEFAULT 'dashboard',
        ip TEXT,
        user_agent TEXT,
        viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ca_report_views_tenant_idx ON ca_report_views(tenant_id, viewed_at);
      CREATE INDEX IF NOT EXISTS ca_report_views_viewer_idx ON ca_report_views(viewer_id, viewed_at);
    `);
  });
  _tableReady = true;
}

/**
 * Записать заход. Троттлинг: если этот же viewer смотрел этот token за последние
 * 10 минут — не дублируем (обновляем только время последней записи не трогаем).
 * Возвращает true если новая запись создана.
 */
export async function recordView(opts: {
  tenantId: number;
  token: string;
  viewerId: string;
  kind?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<boolean> {
  await ensureTable();
  const db = getDbAsync();
  const recent = await db
    .prepare(
      `SELECT id FROM ca_report_views
       WHERE viewer_id = ? AND token = ? AND viewed_at >= (NOW() + interval '-10 minute')
       LIMIT 1`
    )
    .get<{ id: number }>(opts.viewerId, opts.token);
  if (recent) return false;
  await db
    .prepare(
      `INSERT INTO ca_report_views (tenant_id, token, viewer_id, kind, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.tenantId,
      opts.token,
      opts.viewerId,
      opts.kind ?? "dashboard",
      opts.ip ?? null,
      (opts.userAgent ?? null)?.slice(0, 300) ?? null
    );
  return true;
}

export interface ReportViewStats {
  total30d: number;
  uniqueViewers30d: number;
  lastViewedAt: string | null;
  perDay: { date: string; count: number }[]; // последние 14 дней
  recent: { viewedAt: string; kind: string; device: string; ipMasked: string | null }[];
  activeDays30d: number; // сколько разных дней были заходы (регулярность)
}

/** Сводка для владельца — коротко, без «портянок». */
export async function getViewStats(tenantId: number): Promise<ReportViewStats> {
  await ensureTable();
  const db = getDbAsync();

  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT viewer_id) AS u
       FROM ca_report_views
       WHERE tenant_id = ? AND viewed_at >= (NOW() + interval '-30 day')`
    )
    .get<{ n: number; u: number }>(tenantId);

  const lastRow = await db
    .prepare(`SELECT MAX(viewed_at)::text AS last FROM ca_report_views WHERE tenant_id = ?`)
    .get<{ last: string | null }>(tenantId);

  const dayRows = await db
    .prepare(
      `SELECT substr(viewed_at::text, 1, 10) AS d, COUNT(*) AS n
       FROM ca_report_views
       WHERE tenant_id = ? AND viewed_at >= (NOW() + interval '-14 day')
       GROUP BY substr(viewed_at::text, 1, 10)
       ORDER BY d`
    )
    .all<{ d: string; n: number }>(tenantId);

  const activeRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT substr(viewed_at::text, 1, 10)) AS days
       FROM ca_report_views
       WHERE tenant_id = ? AND viewed_at >= (NOW() + interval '-30 day')`
    )
    .get<{ days: number }>(tenantId);

  const recentRows = await db
    .prepare(
      `SELECT viewed_at::text AS viewed_at, kind, ip, user_agent
       FROM ca_report_views
       WHERE tenant_id = ?
       ORDER BY viewed_at DESC
       LIMIT 12`
    )
    .all<{ viewed_at: string; kind: string; ip: string | null; user_agent: string | null }>(tenantId);

  // Собираем per-day за 14 дней с нулями
  const byDay = new Map(dayRows.map((r) => [r.d, Number(r.n)]));
  const perDay: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    perDay.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  return {
    total30d: Number(totalRow?.n ?? 0),
    uniqueViewers30d: Number(totalRow?.u ?? 0),
    lastViewedAt: lastRow?.last ?? null,
    activeDays30d: Number(activeRow?.days ?? 0),
    perDay,
    recent: recentRows.map((r) => ({
      viewedAt: r.viewed_at,
      kind: r.kind,
      device: detectDevice(r.user_agent),
      ipMasked: maskIp(r.ip),
    })),
  };
}

/** Имя тенанта для шапки публичного отчёта. */
export async function getTenantName(tenantId: number): Promise<string> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT name FROM tenants WHERE id = ?`)
    .get<{ name: string }>(tenantId);
  return row?.name?.trim() || "Отчёт";
}

function detectDevice(ua: string | null): string {
  if (!ua) return "—";
  if (/iPhone|Android.*Mobile|Mobile/i.test(ua)) return "Телефон";
  if (/iPad|Tablet/i.test(ua)) return "Планшет";
  if (/Windows|Macintosh|Linux|X11/i.test(ua)) return "Компьютер";
  return "—";
}

function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  // Берём первый адрес из x-forwarded-for и маскируем последний октет
  const first = ip.split(",")[0].trim();
  const m = first.match(/^(\d+)\.(\d+)\.(\d+)\.\d+$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}.×`;
  return first.length > 12 ? first.slice(0, 12) + "…" : first;
}
