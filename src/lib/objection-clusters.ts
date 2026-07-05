/**
 * Семантическая кластеризация возражений: раскладываем уникальные формулировки
 * по ФИКСИРОВАННОЙ таксономии категорий (DEFAULT_TAXONOMY, редактируема per-tenant
 * через настройку "objection_taxonomy_json"). AI НЕ придумывает категории — только
 * относит каждую фразу к одной из заданных, батчами по 100 фраз (устойчивее, чем
 * один вызов на 1500 позиций, где модель «плывёт» и путает, например, тайминг
 * («перезвонить позже») с «Техническими» или «не строимся» с «Ценой»).
 * Результат кэшируется в ca_objection_clusters (map rawPhrase→category). Страница
 * возражений агрегирует ЖИВЫЕ счётчики по категориям, поэтому цифры свежие;
 * пересчёт категорий — по кнопке (AI-вызов платный).
 */
import { getDbAsync } from "./db-compat";
import { callWithTool } from "./ai-provider";
import { getSetting } from "./db";

let _tableReady = false;
async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  const db = getDbAsync();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ca_objection_clusters (
      tenant_id INTEGER PRIMARY KEY,
      computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      map_json TEXT NOT NULL
    );
  `).catch(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ca_objection_clusters (
        tenant_id INTEGER PRIMARY KEY,
        computed_at TEXT NOT NULL DEFAULT (datetime('now')),
        map_json TEXT NOT NULL
      );
    `);
  });
  _tableReady = true;
}

export interface ClusterCache { map: Record<string, string>; computedAt: string | null }

/** Прочитать кэш кластеров (map rawPhrase→category) или null если ещё не считали. */
export async function getClusterMap(tenantId: number): Promise<ClusterCache | null> {
  await ensureTable();
  const row = await getDbAsync()
    .prepare("SELECT computed_at::text AS computed_at, map_json FROM ca_objection_clusters WHERE tenant_id = ?")
    .get<{ computed_at: string; map_json: string }>(tenantId)
    .catch(() => undefined);
  if (!row) return null;
  try { return { map: JSON.parse(row.map_json), computedAt: row.computed_at }; } catch { return null; }
}

export interface TaxonomyCategory { name: string; def: string }

/** Фиксированная таксономия категорий возражений (дефолт, переопределяемый per-tenant). */
export const DEFAULT_TAXONOMY: TaxonomyCategory[] = [
  {
    name: "Не наш профиль / не по адресу",
    def: "клиент не связан со стройкой/металлом, ошиблись сферой/номером.",
  },
  {
    name: "Нет текущей потребности",
    def: "сейчас не строят и не закупают, нет актуального объекта/проекта. НЕ про «неудобно говорить» и НЕ про замороженный проект.",
  },
  {
    name: "Не вовремя для разговора",
    def: "разговор СОСТОЯЛСЯ (собеседник на линии, отвечает), но он говорит, что не может общаться ИМЕННО СЕЙЧАС: «перезвоните позже», «не могу говорить сейчас», «занят», «закончился рабочий день», «неудобно говорить», «за рулём». Это про неподходящий МОМЕНТ для разговора, а не про недозвон и не про потребность в продукте.",
  },
  {
    name: "Проект на паузе / заморожен",
    def: "объект/проект есть, но приостановлен: стройка отложена, сроки сдвинуты, финансирование проекта приостановлено.",
  },
  {
    name: "Цена / дорого",
    def: "возражение именно по стоимости: дорого, высокая цена, дешевле у других.",
  },
  {
    name: "Уже работают с другими",
    def: "есть свой поставщик/подрядчик металлоконструкций.",
  },
  {
    name: "Не ЛПР / не тот контакт",
    def: "не принимает решения, не знает кто отвечает за закупки, надо к другому.",
  },
  {
    name: "Технические вопросы / детали",
    def: "конкретные вопросы по продукту, узлам, параметрам, чертежам, документам.",
  },
  {
    name: "Нет бюджета / финансирования",
    def: "нет денег/бюджет не выделен В ПРИНЦИПЕ (не про конкретную цену и не про паузу проекта).",
  },
  {
    name: "Сроки поставки / производства",
    def: "не устраивают сроки изготовления/поставки.",
  },
  {
    name: "Качество / доверие / сомнения",
    def: "сомнения в качестве, надёжности, репутации.",
  },
  {
    name: "Категорический отказ / не звонить",
    def: "жёсткий отказ, просьба не беспокоить.",
  },
  {
    name: "Не дозвонились / нет контакта",
    def: "разговор ВООБЩЕ НЕ СОСТОЯЛСЯ технически: абонент недоступен/вне зоны, сброс звонка, длинные гудки без ответа, автоответчик. НЕ используй, если собеседник ответил и что-то сказал (даже «не могу говорить сейчас») — это уже состоявшийся контакт, см. «Не вовремя для разговора».",
  },
  {
    name: "Прочее",
    def: "только если фраза реально не подходит ни к одной категории.",
  },
];

/** Получить таксономию для тенанта: per-tenant override (settings) или дефолт. */
export async function getTaxonomy(tenantId: number): Promise<TaxonomyCategory[]> {
  const raw = await getSetting(`objection_taxonomy_json:${tenantId}`).catch(() => null);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed
          .map((c) => ({ name: String(c?.name ?? "").trim(), def: String(c?.def ?? "").trim() }))
          .filter((c) => c.name);
        if (cleaned.length > 0) return cleaned;
      }
    } catch {
      // игнорируем битый override, используем дефолт
    }
  }
  return DEFAULT_TAXONOMY;
}

const BATCH_SIZE = 100;

function batchSchema(size: number) {
  return {
    type: "object",
    properties: {
      assignments: {
        type: "array",
        items: { type: "number" },
        description: `Массив длиной ровно ${size}. assignments[i] — индекс категории (0..N-1 из списка категорий) для фразы №(i+1) в этом батче. КАЖДОЙ фразе — ровно одна категория.`,
      },
    },
    required: ["assignments"],
  } as const;
}

function buildSystem(categories: TaxonomyCategory[]): string {
  const catList = categories.map((c, i) => `${i}. ${c.name} — ${c.def}`).join("\n");
  return `Ты — руководитель отдела продаж. Тебе дают пронумерованный список возражений клиентов из звонков и ФИКСИРОВАННЫЙ список категорий с определениями. Твоя задача — только РАЗЛОЖИТЬ фразы по этим категориям, НЕ придумывая новые. Разбирай КАЖДУЮ фразу отдельно, не по одному ключевому слову, а по всей ситуации клиента.

ГЛАВНЫЕ ЛОВУШКИ (частые ошибки, ИЗБЕГАЙ их):
1. «Не могу говорить сейчас», «перезвоните позже», «занят», «закончился рабочий день», «неудобно говорить», «за рулём» — разговор с человеком СОСТОЯЛСЯ, он ответил и говорит. Это категория «Не вовремя для разговора». Это ТОЧНО НЕ категория «Не дозвонились / нет контакта» — та только для случаев, когда до человека физически не достучались (гудки без ответа, «абонент недоступен», сброс на середине набора, автоответчик). Проверка: если в тексте фразы клиент что-то ОТВЕТИЛ или ПОПРОСИЛ — это «Не вовремя», а не «Не дозвонились».
2. «Не строимся», «нет необходимости [в товаре/услуге]», «пока не актуально» — это «Нет текущей потребности», а НЕ «Цена / дорого».
3. «Финансирование приостановлено», «стройка отложена», «пауза в проекте» — конкретный проект существует, но стоит. Это «Проект на паузе / заморожен», а НЕ «Нет бюджета / финансирования» (там денег нет в принципе, без привязки к проекту) и НЕ «Цена / дорого».

Категории:
${catList}

Правило: относи каждую фразу к категории по СМЫСЛУ ситуации клиента, а не по совпадению слов. Каждой фразе — ровно одна категория, наиболее точно описывающая ситуацию. «Прочее» используй ТОЛЬКО если фраза реально не подходит ни к одной из остальных категорий.
Верни assignments — массив индексов категорий (0..${categories.length - 1}) длиной ровно как список фраз в этом батче.`;
}

/** Пересчитать кластеры через AI (батчами) и сохранить. Возвращает map + число категорий. */
export async function computeClusterMap(tenantId: number): Promise<{ ok: boolean; categories: number; phrases: number; error?: string }> {
  await ensureTable();
  const db = getDbAsync();

  // Уникальные формулировки возражений тенанта
  const rows = await db
    .prepare(
      `SELECT a.objections_json FROM analyses a JOIN calls c ON c.id = a.call_id
       WHERE c.tenant_id = ? AND a.objections_json IS NOT NULL AND a.objections_json <> '' AND a.objections_json <> '[]'`
    )
    .all<{ objections_json: string }>(tenantId);

  const uniq = new Map<string, number>();
  for (const r of rows) {
    let arr: unknown;
    try { arr = JSON.parse(r.objections_json); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    for (const o of arr) {
      const raw = String(o).trim();
      if (raw) uniq.set(raw, (uniq.get(raw) ?? 0) + 1);
    }
  }
  const phrases = [...uniq.keys()];
  if (phrases.length === 0) return { ok: false, categories: 0, phrases: 0, error: "Нет возражений для группировки" };

  // Все уникальные формулировки (по частоте), потолок на общий объём.
  const ranked = [...uniq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1500).map(([p]) => p);

  const categories = await getTaxonomy(tenantId);
  const system = buildSystem(categories);

  const map: Record<string, string> = {};
  for (let start = 0; start < ranked.length; start += BATCH_SIZE) {
    const batch = ranked.slice(start, start + BATCH_SIZE);
    const list = batch.map((p, i) => `${i + 1}. ${p}`).join("\n");

    let result: { assignments: number[] };
    try {
      const out = await callWithTool<{ assignments: number[] }>({
        toolName: "assign_objection_categories",
        schema: batchSchema(batch.length) as unknown as Record<string, unknown>,
        system,
        user: `Возражения (${batch.length} шт.):\n${list}\n\nВерни assignments длиной ровно ${batch.length}.`,
        modelTier: "premium",
        maxTokens: 4000,
        tenantId,
      });
      result = out.result;
    } catch (e) {
      return { ok: false, categories: 0, phrases: phrases.length, error: (e as Error).message };
    }

    const assign = result.assignments || [];
    for (let i = 0; i < batch.length; i++) {
      const ci = Number(assign[i]);
      const name = Number.isInteger(ci) && ci >= 0 && ci < categories.length ? categories[ci].name : "";
      if (name) map[batch[i]] = name;
    }
  }

  const catCount = new Set(Object.values(map)).size;
  if (Object.keys(map).length === 0) return { ok: false, categories: 0, phrases: phrases.length, error: "AI не вернул группировку" };

  await db
    .prepare(
      `INSERT INTO ca_objection_clusters (tenant_id, computed_at, map_json)
       VALUES (?, NOW(), ?)
       ON CONFLICT (tenant_id) DO UPDATE SET computed_at = NOW(), map_json = excluded.map_json`
    )
    .run(tenantId, JSON.stringify(map))
    .catch(async () => {
      // SQLite fallback
      await db.prepare(`INSERT INTO ca_objection_clusters (tenant_id, computed_at, map_json) VALUES (?, datetime('now'), ?)
        ON CONFLICT(tenant_id) DO UPDATE SET computed_at = datetime('now'), map_json = excluded.map_json`).run(tenantId, JSON.stringify(map));
    });

  return { ok: true, categories: catCount, phrases: Object.keys(map).length };
}
