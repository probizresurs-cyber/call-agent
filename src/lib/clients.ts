/**
 * §4.6 MASTER-TZ — профиль клиента 360.
 *
 * «Якорь» клиента сейчас — нормализованный телефон (только цифры).
 * Один телефон = один профиль. Если у клиента несколько номеров — это разные профили
 * (будущая итерация: matching через Bitrix contact_id + phone book клиента).
 *
 * Туда же подтягиваются все типы взаимодействий: звонки, чаты, email, встречи.
 * Хронология — единая, сортировка по started_at DESC.
 */
import { getDbAsync } from "./db-compat";

/** Нормализует телефон до digits-only для сравнения и URL. "+7 (916) 123-45-67" → "79161234567" */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "").replace(/^8/, "7");
}

/** Возвращает SQL-условие которое матчит звонок с любым представлением переданного номера. */
function phoneMatchSql(table: string): string {
  // В БД телефоны хранятся в разных форматах ('+7...', '79...', '89...').
  // Сравниваем по подстроке последних 10 цифр — это уникальная часть для РФ-номеров.
  // Не идеально (вдруг 8 цифр совпадут случайно), но для пилота достаточно.
  return `regexp_replace(${table}.client_phone, '[^0-9]', '', 'g') LIKE ?`;
}

/** SQLite не имеет regexp_replace по умолчанию. Падение на SQLite → fallback: LIKE по нормализованному. */
function phoneMatchSqlSafe(): string {
  // Применяем простой LIKE: '%79161234567%' будет искать в исходной строке.
  // Это сработает для большинства форматов хранения (+79161234567, 79161234567, 8 916 ...).
  return `replace(replace(replace(replace(client_phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?`;
}

export interface ClientListItem {
  phone: string;              // нормализованный (digits-only)
  display_phone: string;      // как было сохранено в первом звонке (для отображения)
  name: string | null;        // последнее известное имя клиента
  total_count: number;
  last_at: string | null;     // ISO timestamp последнего касания
  positive: number;
  neutral: number;
  negative: number;
  loose_threads: number;      // оборванные нити (см. detectLooseThreads)
}

export interface ClientProfileSummary {
  phone: string;
  display_phone: string;
  name: string | null;

  total_count: number;
  first_at: string | null;
  last_at: string | null;

  // KPI по типам
  by_type: Record<string, number>;  // call/chat/email/meeting → count

  // Настроение
  positive: number;
  neutral: number;
  negative: number;

  // CRM-привязки (уникальные id из всех взаимодействий)
  deal_ids: string[];
  lead_ids: string[];
  contact_ids: string[];

  // Менеджеры которые работали с клиентом (для РОПа)
  managers: Array<{ id: string | null; name: string | null; count: number }>;
}

export interface InteractionTimelineItem {
  id: number;
  interaction_type: string;
  channel: string;
  direction: "in" | "out" | null;
  started_at: string | null;
  duration_sec: number;
  status: string;
  manager_name: string | null;
  manager_id: string | null;
  summary: string | null;
  sentiment: string | null;
  manager_score: number | null;
  next_action: string | null;
  bitrix_deal_id: string | null;
  bitrix_lead_id: string | null;
  bitrix_contact_id: string | null;
}

export interface LooseThread {
  kind: "no_next_action" | "promise_overdue" | "negative_unfollowed" | "long_silence";
  callId: number;
  startedAt: string | null;
  description: string;
  daysAgo: number;
}

// ───────── Список клиентов ─────────

/**
 * Топ-N клиентов с метриками за весь период.
 * Группировка по нормализованному телефону.
 *
 * SQL-сложность: один запрос с GROUP BY normalized_phone. Нормализацию
 * делаем в SQL через regexp_replace (PG) — на SQLite этот SQL упадёт,
 * но т.к. прод на PG — допустимо.
 */
export async function listClients(opts: {
  tenantId: number;
  managerId?: string | null;  // для роли manager — фильтр по своему bitrixManagerId
  search?: string;
  limit?: number;
}): Promise<ClientListItem[]> {
  const db = getDbAsync();
  const limit = opts.limit ?? 50;
  const where: string[] = [
    "c.tenant_id = ?",
    "c.client_phone IS NOT NULL",
    "c.client_phone != ''",
  ];
  const params: unknown[] = [opts.tenantId];

  if (opts.managerId) {
    where.push("c.manager_id = ?");
    params.push(opts.managerId);
  }
  if (opts.search) {
    const s = `%${opts.search}%`;
    where.push("(c.client_phone LIKE ? OR c.manager_name LIKE ? OR a.client_name LIKE ?)");
    params.push(s, s, s);
  }

  // Нормализуем телефон в SQL — оставляем только цифры, отбрасываем ведущую 8.
  // regexp_replace доступен и в PG, и в SQLite (с extension), но в better-sqlite3 — нет.
  // Поэтому делаем нормализацию в TS после fetch.
  const rows = await db
    .prepare(
      `SELECT
         c.client_phone AS phone,
         MAX(a.client_name) AS name,
         COUNT(*) AS total_count,
         MAX(c.started_at) AS last_at,
         SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END) AS positive,
         SUM(CASE WHEN a.sentiment='neutral'  THEN 1 ELSE 0 END) AS neutral,
         SUM(CASE WHEN a.sentiment='negative' THEN 1 ELSE 0 END) AS negative,
         SUM(CASE WHEN a.next_action IS NULL OR a.next_action = '' OR a.next_action = '—' THEN 1 ELSE 0 END) AS no_next_action
       FROM calls c
       LEFT JOIN analyses a ON a.call_id = c.id
       WHERE ${where.join(" AND ")}
       GROUP BY c.client_phone
       ORDER BY MAX(c.started_at) DESC NULLS LAST
       LIMIT ?`
    )
    .all<{
      phone: string; name: string | null;
      total_count: number; last_at: string | null;
      positive: number; neutral: number; negative: number;
      no_next_action: number;
    }>(...params, limit);

  // Группируем по нормализованному телефону (один профиль на номер).
  const byNorm = new Map<string, ClientListItem>();
  for (const r of rows) {
    const norm = normalizePhone(r.phone);
    if (!norm) continue;
    const existing = byNorm.get(norm);
    if (existing) {
      // Если для одного нормализованного телефона два формата — суммируем
      existing.total_count += Number(r.total_count);
      existing.positive += Number(r.positive);
      existing.neutral += Number(r.neutral);
      existing.negative += Number(r.negative);
      existing.loose_threads += Number(r.no_next_action);
      if (r.last_at && (!existing.last_at || r.last_at > existing.last_at)) existing.last_at = r.last_at;
      existing.name = existing.name || r.name;
    } else {
      byNorm.set(norm, {
        phone: norm,
        display_phone: r.phone,
        name: r.name,
        total_count: Number(r.total_count),
        last_at: r.last_at,
        positive: Number(r.positive),
        neutral: Number(r.neutral),
        negative: Number(r.negative),
        loose_threads: Number(r.no_next_action),
      });
    }
  }
  return Array.from(byNorm.values()).sort((a, b) => {
    if (a.last_at && b.last_at) return a.last_at < b.last_at ? 1 : -1;
    if (a.last_at) return -1;
    if (b.last_at) return 1;
    return 0;
  });
}

// ───────── Профиль клиента 360 ─────────

export async function getClientProfile(opts: {
  tenantId: number;
  normalizedPhone: string;
  managerId?: string | null;
}): Promise<{ summary: ClientProfileSummary; timeline: InteractionTimelineItem[] } | null> {
  const db = getDbAsync();
  const where: string[] = ["c.tenant_id = ?"];
  const params: unknown[] = [opts.tenantId];

  // Матчим разные форматы хранения phone — оставляем те где digit-only форма содержит наш phone
  // Простой LIKE: '%79161234567%' найдёт +79161234567, 79161234567, "8 (916) 123-45-67" — НЕ.
  // Поэтому в WHERE прокидываем несколько вариантов через OR.
  const variants = phoneVariants(opts.normalizedPhone);
  where.push("(" + variants.map(() => "c.client_phone LIKE ?").join(" OR ") + ")");
  params.push(...variants.map((v) => `%${v}%`));

  if (opts.managerId) {
    where.push("c.manager_id = ?");
    params.push(opts.managerId);
  }

  const rows = await db
    .prepare(
      `SELECT
         c.id, c.interaction_type, c.channel, c.direction, c.started_at, c.duration_sec, c.status,
         c.manager_name, c.manager_id, c.client_phone,
         c.bitrix_deal_id, c.bitrix_lead_id, c.bitrix_contact_id,
         a.summary, a.sentiment, a.manager_score, a.next_action, a.client_name
       FROM calls c
       LEFT JOIN analyses a ON a.call_id = c.id
       WHERE ${where.join(" AND ")}
       ORDER BY c.started_at DESC NULLS LAST, c.id DESC
       LIMIT 500`
    )
    .all<InteractionTimelineItem & { client_phone: string; client_name: string | null }>(...params);

  if (rows.length === 0) return null;

  // Агрегаты для summary
  const by_type: Record<string, number> = {};
  let positive = 0, neutral = 0, negative = 0;
  const dealIds = new Set<string>();
  const leadIds = new Set<string>();
  const contactIds = new Set<string>();
  const managerCounts = new Map<string, { id: string | null; name: string | null; count: number }>();
  let first_at: string | null = null;
  let last_at: string | null = null;
  let display_phone = "";
  let name: string | null = null;

  for (const r of rows) {
    const t = r.interaction_type || "call";
    by_type[t] = (by_type[t] ?? 0) + 1;
    if (r.sentiment === "positive") positive++;
    if (r.sentiment === "neutral")  neutral++;
    if (r.sentiment === "negative") negative++;
    if (r.bitrix_deal_id)    dealIds.add(r.bitrix_deal_id);
    if (r.bitrix_lead_id)    leadIds.add(r.bitrix_lead_id);
    if (r.bitrix_contact_id) contactIds.add(r.bitrix_contact_id);

    const mgrKey = r.manager_id ?? `name:${r.manager_name ?? "_"}`;
    const cur = managerCounts.get(mgrKey);
    if (cur) cur.count++;
    else managerCounts.set(mgrKey, { id: r.manager_id, name: r.manager_name, count: 1 });

    if (r.started_at) {
      if (!first_at || r.started_at < first_at) first_at = r.started_at;
      if (!last_at || r.started_at > last_at) last_at = r.started_at;
    }
    if (!display_phone) display_phone = r.client_phone;
    if (!name && r.client_name) name = r.client_name;
  }

  const summary: ClientProfileSummary = {
    phone: opts.normalizedPhone,
    display_phone,
    name,
    total_count: rows.length,
    first_at,
    last_at,
    by_type,
    positive, neutral, negative,
    deal_ids: Array.from(dealIds),
    lead_ids: Array.from(leadIds),
    contact_ids: Array.from(contactIds),
    managers: Array.from(managerCounts.values()).sort((a, b) => b.count - a.count),
  };

  return { summary, timeline: rows };
}

/**
 * Генерирует возможные представления телефона для LIKE-поиска.
 * Нормализованная форма "79161234567" → ["79161234567", "+79161234567", "89161234567", "9161234567"]
 */
function phoneVariants(normalized: string): string[] {
  if (!normalized || normalized.length < 10) return [normalized];
  const variants = new Set<string>();
  variants.add(normalized);
  variants.add("+" + normalized);
  // Замена ведущей 7 на 8 (РФ-специфика)
  if (normalized.startsWith("7")) {
    variants.add("8" + normalized.slice(1));
  } else if (normalized.startsWith("8")) {
    variants.add("7" + normalized.slice(1));
  }
  // Последние 10 цифр (без кода страны)
  variants.add(normalized.slice(-10));
  return Array.from(variants);
}

// ───────── Оборванные нити ─────────

/**
 * Эвристики «оборванной нити»:
 *  1. no_next_action — взаимодействие done, длительностью ≥ 60 сек или с текстом > 200 симв,
 *     но next_action пуст или содержит «не определён»
 *  2. promise_overdue — next_action содержит «перезвонить через N дней / в среду / завтра»
 *     и с тех пор прошло больше срока без нового касания этого клиента
 *  3. negative_unfollowed — последнее касание было negative более 5 дней назад,
 *     с тех пор тишина
 *  4. long_silence — более 30 дней без касаний при активной истории (был хотя бы 1 разговор done)
 *
 * Эвристики простые — без AI. В будущем можно отдельным Claude-вызовом
 * парсить next_action и точно определять сроки.
 */
export function detectLooseThreads(timeline: InteractionTimelineItem[]): LooseThread[] {
  const threads: LooseThread[] = [];
  const now = Date.now();

  // Время последнего касания (любого типа)
  const lastInteractionTs = timeline[0]?.started_at ? toMs(timeline[0].started_at) : null;

  // Эвристика 4 — long_silence
  if (lastInteractionTs) {
    const daysAgo = Math.floor((now - lastInteractionTs) / 86400000);
    if (daysAgo >= 30) {
      threads.push({
        kind: "long_silence",
        callId: timeline[0].id,
        startedAt: timeline[0].started_at,
        description: `Полная тишина уже ${daysAgo} дней`,
        daysAgo,
      });
    }
  }

  // Эвристика 3 — negative_unfollowed (последнее касание negative более 5 дней назад)
  if (timeline.length > 0 && timeline[0].sentiment === "negative") {
    const lastNegTs = timeline[0].started_at ? toMs(timeline[0].started_at) : null;
    if (lastNegTs) {
      const days = Math.floor((now - lastNegTs) / 86400000);
      if (days >= 5) {
        threads.push({
          kind: "negative_unfollowed",
          callId: timeline[0].id,
          startedAt: timeline[0].started_at,
          description: `Последнее общение было негативным, прошло ${days} дней без касаний`,
          daysAgo: days,
        });
      }
    }
  }

  // Эвристики 1+2 на каждом анализе с пометкой
  for (const it of timeline) {
    if (it.status !== "done") continue;

    const isSubstantive = it.duration_sec >= 60 || (it.summary && it.summary.length > 100);
    const noAction = !it.next_action || it.next_action === "—" || /не определ|нет следующ/i.test(it.next_action);
    if (isSubstantive && noAction) {
      const ts = it.started_at ? toMs(it.started_at) : null;
      const days = ts ? Math.floor((now - ts) / 86400000) : 0;
      // Не дублируем если уже была long_silence для этого же звонка
      if (!threads.some((t) => t.callId === it.id)) {
        threads.push({
          kind: "no_next_action",
          callId: it.id,
          startedAt: it.started_at,
          description: "Следующий шаг не зафиксирован — потенциально упущенный лид",
          daysAgo: days,
        });
      }
    }

    // Эвристика 2 — promise_overdue: парсим «перезвонить через N дней»
    if (it.next_action) {
      const m = it.next_action.match(/через\s+(\d+)\s+дн/i);
      if (m) {
        const promiseDays = parseInt(m[1], 10);
        const ts = it.started_at ? toMs(it.started_at) : null;
        if (ts && promiseDays > 0) {
          const dueTs = ts + promiseDays * 86400000;
          const elapsed = now - dueTs;
          if (elapsed > 86400000) {
            // Проверим, было ли касание ПОСЛЕ обещания
            const followedUp = timeline.some((other) => {
              if (other.id === it.id) return false;
              const otherTs = other.started_at ? toMs(other.started_at) : null;
              return otherTs && otherTs > dueTs - 86400000;
            });
            if (!followedUp) {
              threads.push({
                kind: "promise_overdue",
                callId: it.id,
                startedAt: it.started_at,
                description: `Обещали "${it.next_action.slice(0, 60)}" — срок прошёл ${Math.floor(elapsed / 86400000)} дней назад`,
                daysAgo: Math.floor((now - ts) / 86400000),
              });
            }
          }
        }
      }
    }
  }

  // Сортировка: сначала самые старые / критичные
  return threads.sort((a, b) => b.daysAgo - a.daysAgo).slice(0, 10);
}

function toMs(iso: string): number {
  const s = iso.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(s);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
