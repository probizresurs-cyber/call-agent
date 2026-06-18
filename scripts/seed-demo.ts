/**
 * seed-demo.ts — наполнение публичного ДЕМО-режима (витрина для клиентов).
 *
 * Создаёт изолированный тенант id=9999 «ООО Ромашка» с вымышленными, но
 * правдоподобными данными: 5 менеджеров, 2 скрипта, ~130-150 взаимодействий
 * (звонки/чаты/email/встречи) за последние 30 дней + анализы + транскрипты +
 * расхождения с CRM, и demo-пользователя (login=test, role=demo) для входа
 * без пароля через /call-agent/demo.
 *
 * Запуск (как остальные scripts — через tsx, см. package.json):
 *   npx tsx scripts/seed-demo.ts
 * На проде (Postgres) — заранее экспортировать DB_DRIVER=postgres и DATABASE_URL
 * (они и так в .env, loadEnv их подхватит).
 *
 * Идемпотентно: при каждом запуске сначала полностью удаляет данные тенанта 9999
 * (включая card_discrepancies), затем создаёт заново. Безопасно гонять сколько угодно раз.
 *
 * ВАЖНО про идемпотентность генератора: взаимодействия генерируются ДЕТЕРМИНИРОВАННО
 * (счётчик i + арифметика по индексам массивов), БЕЗ Math.random()/Date.now() в значениях,
 * чтобы повторный запуск давал тот же набор. Даты считаем от new Date() через вычитание
 * daysAgo — это обычный Node-скрипт, не workflow, так что текущая дата допустима.
 *
 * Изоляция: ВСЁ привязано к tenant_id = 9999. Боевые данные (tenant 1 и др.) не трогаются.
 */
import path from "path";
import { loadEnv } from "../src/lib/loadEnv";
// .env ДО любых импортов читающих process.env (в т.ч. db-compat выбирает драйвер по ENV).
loadEnv(path.join(__dirname, ".."));

import bcrypt from "bcryptjs";
import { getDbAsync, getDriverName } from "../src/lib/db-compat";

const DEMO_TENANT = 9999;
const DEMO_TENANT_NAME = "ООО Ромашка";
const DEMO_LOGIN = "test";
const DEMO_PASSWORD = "test";

// Сколько взаимодействий генерируем (в диапазоне «как у живого клиента ~150 звонков»).
const TOTAL_INTERACTIONS = 140;
// Глубина истории в днях (динамика 14 дней + помесячные графики наполнены).
const DAYS_SPAN = 30;

// Менеджеры (Bitrix-id 900001..900005).
// baseScore — «средний уровень» менеджера: задаёт разброс лидерборда (одни сильнее других).
const MANAGERS = [
  { id: "900001", name: "Иванов Иван", baseScore: 7.8 },
  { id: "900002", name: "Петрова Анна", baseScore: 8.6 },
  { id: "900003", name: "Сидоров Пётр", baseScore: 5.9 },
  { id: "900004", name: "Кузнецова Мария", baseScore: 8.1 },
  { id: "900005", name: "Орлов Дмитрий", baseScore: 6.4 },
];

// Заказчики — повторяются у разных взаимодействий (чтобы в /clients были профили с историей).
// Расширено до 20 (разные ООО/ИП/ЗАО).
const CLIENTS = [
  { name: "ООО СтройМир", phone: "+79001112201" },
  { name: "ИП Васильев", phone: "+79001112202" },
  { name: "ЗАО ТехноПром", phone: "+79001112203" },
  { name: "ООО Альфа-Строй", phone: "+79001112204" },
  { name: "Розница-Опт", phone: "+79001112205" },
  { name: "ООО ГрадМонтаж", phone: "+79001112206" },
  { name: "ИП Соколова", phone: "+79001112207" },
  { name: "ООО Запад", phone: "+79001112208" },
  { name: "ООО МеталлТорг", phone: "+79001112209" },
  { name: "ИП Григорьев", phone: "+79001112210" },
  { name: "ООО ПромКаркас", phone: "+79001112211" },
  { name: "ЗАО СеверСталь-Сервис", phone: "+79001112212" },
  { name: "ООО Уют-Павильон", phone: "+79001112213" },
  { name: "ИП Морозова", phone: "+79001112214" },
  { name: "ООО ГорТорг", phone: "+79001112215" },
  { name: "ООО ТехСнаб", phone: "+79001112216" },
  { name: "ИП Лебедев", phone: "+79001112217" },
  { name: "ООО СтальМонтажСервис", phone: "+79001112218" },
  { name: "ЗАО ВолгаСтрой", phone: "+79001112219" },
  { name: "ООО КиоскГрупп", phone: "+79001112220" },
];

const OBJECTIONS = ["дорого", "посоветоваться", "работаем с другими", "не сезон", "нет бюджета", "долгие сроки"];
const TOPICS_MP = ["модульные павильоны", "сроки изготовления", "монтаж под ключ", "размеры", "цена за модуль", "комплектация", "гарантия"];
const TOPICS_MK = ["металлоконструкции", "вес конструкции", "проектная документация", "доставка", "оцинковка", "монтаж на объекте", "спецификация"];

// Шаблоны summary под продукт — комбинируем по индексам, чтобы звучало по-разному.
const SUMMARIES_MP = [
  "Презентовал модульный павильон {size} м, клиент заинтересован, запросил КП. Договорились о расчёте под ключ.",
  "Повторный контакт по павильону. Клиент думает, попросил скидку и сравнение с конкурентами.",
  "Входящий по модульному павильону для торговой точки. Уточнял сроки изготовления и комплектацию.",
  "Эталонный звонок: полная квалификация, презентация выгод, договорённость о сделке с датой.",
  "Клиент недоволен сроками изготовления. Менеджер отработал возражение, предложил ускоренную сборку.",
  "Согласовали павильон для летнего кафе, обсудили монтаж под ключ и рассрочку.",
  "Короткий входящий — уточнение цены за модуль. Менеджер выслал каталог и предложил созвон.",
  "Клиент выбирает между павильоном 4×4 и 6×3. Менеджер помог определиться по задаче.",
];
const SUMMARIES_MK = [
  "Обсудили проект металлокаркаса ангара. Клиент попросил оцинковку, согласовали доплату.",
  "Входящий по крупному заказу металлоконструкций. Хорошая квалификация, бюджет подтверждён.",
  "Согласовали спецификацию металлокаркаса. Клиент подтвердил готовность к договору.",
  "Жалоба на задержку доставки металлоконструкций. Менеджер согласовал новую дату.",
  "Уточняли вес фермы и проектную документацию. Передали запрос проектировщикам.",
  "Закрыл возражение «работаем с другими», показал преимущество по срокам и оцинковке.",
  "Обсудили монтаж металлоконструкций на объекте, клиент доволен подходом и сроками.",
  "Входящее письмо с ТЗ на металлоконструкции. Менеджер ответил с уточняющими вопросами.",
];

const NEXT_ACTIONS = [
  "Отправить КП до завтра, перезвонить через 2 дня",
  "Выставить счёт, согласовать монтаж на след. неделе",
  "Запросить чертёж, подготовить смету",
  "Согласовать скидку с руководителем",
  "Назначить встречу с инженером",
  "Выезд замерщика на этой неделе",
  "Отправить сравнительное КП и кейсы",
  "Контрольный звонок через 2 дня",
  "Подготовить договор и счёт",
  "Перезвонить с расчётом",
];

const STAGES = ["cold", "qualification", "deal_followup", "informational", "no_contact"];

// Типоразмеры павильонов для подстановки в summary {size}.
const MP_SIZES = ["6×3", "4×4", "3×3", "6×4", "5×2,5", "8×4"];

// ─────────────────────────────────────────────────────────────
// Описание одного демо-взаимодействия (план — потом раскладываем по датам/менеджерам).
interface DemoCall {
  type: "call" | "chat" | "email" | "meeting";
  channel: string;
  direction: "in" | "out";
  duration: number;
  status: "done" | "no_recording";
  client: (typeof CLIENTS)[number];
  manager: (typeof MANAGERS)[number];
  daysAgo: number;
  product: "МП" | "МК";
  sentiment: "positive" | "neutral" | "negative";
  score: number;
  compliance: number;
  summary: string;
  nextAction: string;
  stage: string;
  objections: string[];
  withDeal: boolean;
}

// ─────────────────────────────────────────────────────────────
// Детерминированный генератор взаимодействий.
// Никакого Math.random()/Date.now() — всё от индекса i и простой арифметики,
// чтобы повторный запуск давал тот же набор (идемпотентность).
function buildPlan(): DemoCall[] {
  const plan: DemoCall[] = [];
  for (let i = 0; i < TOTAL_INTERACTIONS; i++) {
    // ── Тип взаимодействия: ~80% call, ~8% chat, ~6% email, ~6% meeting ──
    const typeRoll = i % 25; // 0..24: 0-19 call(20/25=80%), 20-21 chat(8%), 22-23 email(8%→правим), 24 meeting
    let type: DemoCall["type"];
    let channel: string;
    if (typeRoll < 20) {
      type = "call";
      channel = "bitrix_telephony";
    } else if (typeRoll < 22) {
      type = "chat";
      channel = i % 2 === 0 ? "openlines" : "openlines";
    } else if (typeRoll < 24) {
      type = "email";
      channel = "email_imap";
    } else {
      type = "meeting";
      channel = i % 2 === 0 ? "zoom" : "yandex_telemost";
    }

    // ── Менеджер и заказчик — крутим по индексам (разные шаги, чтобы не залипали пары) ──
    const manager = MANAGERS[i % MANAGERS.length];
    const client = CLIENTS[(i * 3 + 1) % CLIENTS.length];

    // ── Дата: раскидываем по 0..(DAYS_SPAN-1) дням; ближе к сегодня — чуть плотнее ──
    const daysAgo = (i * 7) % DAYS_SPAN;

    // ── Продукт: баланс МП/МК (чётные → МП, нечётные → МК, с небольшим перекосом) ──
    const product: "МП" | "МК" = (i + (i % 3)) % 2 === 0 ? "МП" : "МК";

    // ── Статус: ~88% done, ~8% no_recording, остальное done ──
    // no_recording даём только звонкам (у чатов/email/встреч записи нет смысла).
    const statusRoll = i % 12;
    const status: DemoCall["status"] =
      type === "call" && (statusRoll === 3 || statusRoll === 9) ? "no_recording" : "done";

    // ── Длительность 0..900: для звонков разнообразная, для остального 0 (или длинная встреча) ──
    let duration = 0;
    if (type === "call") {
      duration = status === "no_recording" ? 0 : 45 + ((i * 53) % 800); // 45..845
    } else if (type === "meeting") {
      duration = 900 + ((i * 31) % 1500); // встречи длиннее
    }

    // ── Тональность: ~45% positive, ~40% neutral, ~15% negative ──
    const sentRoll = i % 20;
    const sentiment: DemoCall["sentiment"] =
      sentRoll < 9 ? "positive" : sentRoll < 17 ? "neutral" : "negative";

    // ── Оценка менеджера: вокруг baseScore менеджера + вариация от индекса, негатив тянет вниз ──
    const jitter = (((i * 37) % 30) - 15) / 10; // -1.5..+1.4
    let score = manager.baseScore + jitter;
    if (sentiment === "negative") score -= 2.2;
    if (sentiment === "positive") score += 0.6;
    score = Math.max(3.0, Math.min(9.5, score));
    score = Math.round(score * 10) / 10;

    // ── Compliance 0.3..0.95: коррелирует со score ──
    let compliance = 0.3 + ((score - 3.0) / 6.5) * 0.6 + (((i * 17) % 11) - 5) / 100;
    compliance = Math.max(0.3, Math.min(0.95, compliance));
    compliance = Math.round(compliance * 100) / 100;

    // ── Этап сделки ──
    let stage: string;
    if (status === "no_recording") {
      stage = "no_contact";
    } else if (score >= 8) {
      stage = "deal_followup";
    } else if (score >= 6) {
      stage = "qualification";
    } else {
      stage = STAGES[i % STAGES.length];
    }

    // ── Возражения: 0-2 штуки детерминированно; у negative чаще ──
    const objections: string[] = [];
    if (sentiment !== "positive" || i % 3 === 0) {
      objections.push(OBJECTIONS[i % OBJECTIONS.length]);
      if (sentiment === "negative" || i % 5 === 0) {
        objections.push(OBJECTIONS[(i * 2 + 3) % OBJECTIONS.length]);
      }
    }
    // дедуп
    const uniqObj = Array.from(new Set(objections));

    // ── Summary из шаблонов под продукт ──
    const tmpl = product === "МП"
      ? SUMMARIES_MP[i % SUMMARIES_MP.length]
      : SUMMARIES_MK[i % SUMMARIES_MK.length];
    const summary = tmpl.replace("{size}", MP_SIZES[i % MP_SIZES.length]);

    const nextAction = NEXT_ACTIONS[i % NEXT_ACTIONS.length];

    // ── Направление: чаты/входящие письма чаще in, звонки/встречи — микс ──
    const direction: DemoCall["direction"] =
      type === "chat" ? "in" : i % 2 === 0 ? "out" : "in";

    // ── bitrix_deal_id у ~75% (чтобы фильтр «только с CRM» имел смысл) ──
    const withDeal = i % 4 !== 0; // 3 из 4 = 75%

    plan.push({
      type,
      channel,
      direction,
      duration,
      status,
      client,
      manager,
      daysAgo,
      product,
      sentiment,
      score: status === "no_recording" ? 0 : score,
      compliance: status === "no_recording" ? 0 : compliance,
      summary,
      nextAction,
      stage,
      objections: uniqObj,
      withDeal,
    });
  }
  return plan;
}

const PLAN: DemoCall[] = buildPlan();

// ─────────────────────────────────────────────────────────────
// Чек-листы скриптов (5-6 пунктов) — общая структура для МП и МК.
function checklistFor(product: "МП" | "МК") {
  const productLabel = product === "МП" ? "модульного павильона" : "металлоконструкции";
  return [
    { id: "greeting", title: "Приветствие и представление", weight: 2, description: "Менеджер представился, назвал компанию ООО Ромашка" },
    { id: "needs", title: "Выявление потребности", weight: 5, description: "Задал открытые вопросы, понял задачу заказчика" },
    { id: "product", title: `Презентация ${productLabel}`, weight: 4, description: "Рассказал про выгоды продукта, а не только характеристики" },
    { id: "objections", title: "Отработка возражений", weight: 4, description: "Работал с «дорого/подумаю/работаем с другими» по технике" },
    { id: "price", title: "Озвучивание цены и условий", weight: 3, description: "Назвал цену уверенно, объяснил из чего складывается" },
    { id: "next_step", title: "Договорённость о следующем шаге", weight: 5, description: "Конкретный следующий шаг с датой/временем" },
  ];
}

// Оценки чек-листа на основе общего compliance — правдоподобно «размазываем».
function checklistScores(product: "МП" | "МК", compliance: number) {
  const items = checklistFor(product);
  return items.map((it, idx) => {
    // лёгкая вариативность вокруг compliance: первые пункты обычно лучше
    const jitter = ((idx % 3) - 1) * 0.12;
    let score = Math.max(0, Math.min(1, compliance + jitter));
    score = Math.round(score * 100) / 100;
    return {
      id: it.id,
      title: it.title,
      score,
      notes: score >= 0.7 ? "Выполнено" : score >= 0.4 ? "Частично" : "Не выполнено",
    };
  });
}

function coachingTips(c: DemoCall): string[] {
  const tips: string[] = [];
  if (c.compliance < 0.6) tips.push("Чётче фиксируйте следующий шаг с конкретной датой.");
  if (c.objections.includes("дорого")) tips.push("На «дорого» переходите к ценности и рассрочке, а не к скидке сразу.");
  if (c.objections.includes("нет бюджета")) tips.push("При «нет бюджета» выясните горизонт планирования и предложите этапную оплату.");
  if (c.sentiment === "negative") tips.push("При негативе сначала присоединитесь к эмоции клиента, затем предложите решение.");
  if (tips.length === 0) tips.push("Сильный звонок — закрепите результат повторным касанием в срок.");
  return tips;
}

function topicsFor(c: DemoCall): string[] {
  const base = c.product === "МП" ? TOPICS_MP : TOPICS_MK;
  // 2-3 темы детерминированно, со сдвигом по длительности чтобы наборы различались
  const start = c.duration % 3;
  const n = 2 + (c.duration % 2);
  const out = base.slice(start, start + n);
  return out.length ? out : base.slice(0, 2);
}

// started_at в формате 'YYYY-MM-DD HH:MM:SS' (как хранит SQLite и понимает PG-адаптер).
function startedAt(daysAgo: number, idx: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  // рабочее время 9..18, разводим по часам/минутам через индекс
  d.setHours(9 + (idx % 9), (idx * 13) % 60, (idx * 7) % 60, 0);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

// ─────────────────────────────────────────────────────────────
// Описание одного расхождения карточки CRM ↔ стенограммы (для раздела «Расхождения»).
interface DemoDiscrepancy {
  entityType: "deal" | "lead" | "contact";
  fieldName: string;
  fieldLabel: string;
  cardValue: string;
  suggestedValue: string;
  evidence: string;
  severity: "low" | "medium" | "high";
  status: "pending" | "accepted"; // accepted = разрешённое (UI считает его «принято»)
}

// Шаблоны расхождений — привяжем к первым done-звонкам с deal_id.
const DISCREPANCY_TEMPLATES: DemoDiscrepancy[] = [
  { entityType: "deal", fieldName: "OPPORTUNITY", fieldLabel: "Сумма сделки", cardValue: "150 000", suggestedValue: "250 000", evidence: "Клиент согласовал бюджет 250 тыс на встрече, обсуждали комплект под ключ.", severity: "high", status: "pending" },
  { entityType: "deal", fieldName: "STAGE_ID", fieldLabel: "Этап сделки", cardValue: "Первичный контакт", suggestedValue: "Согласование договора", evidence: "Договорились о подписании договора на следующей неделе.", severity: "medium", status: "pending" },
  { entityType: "contact", fieldName: "NAME", fieldLabel: "Контактное лицо", cardValue: "—", suggestedValue: "Сергей (снабжение)", evidence: "Представился: Сергей, отвечаю за снабжение по объекту.", severity: "low", status: "pending" },
  { entityType: "deal", fieldName: "UF_CRM_DELIVERY", fieldLabel: "Срок поставки", cardValue: "30 дней", suggestedValue: "14 дней", evidence: "Уточнили: нужно за 2 недели, иначе срывается монтаж.", severity: "high", status: "pending" },
  { entityType: "deal", fieldName: "UF_CRM_PRODUCT", fieldLabel: "Продукт", cardValue: "Павильон 4×4", suggestedValue: "Павильон 6×3", evidence: "В разговоре остановились на 6×3, не 4×4.", severity: "medium", status: "pending" },
  { entityType: "lead", fieldName: "PHONE", fieldLabel: "Телефон", cardValue: "+7 900 000-00-00", suggestedValue: "+7 901 112-22-09", evidence: "Клиент продиктовал новый рабочий номер для связи.", severity: "low", status: "accepted" },
  { entityType: "deal", fieldName: "UF_CRM_PAYMENT", fieldLabel: "Условия оплаты", cardValue: "100% предоплата", suggestedValue: "50/50 предоплата и по факту", evidence: "Согласовали оплату 50% аванс, 50% после монтажа.", severity: "medium", status: "pending" },
  { entityType: "deal", fieldName: "UF_CRM_COATING", fieldLabel: "Покрытие", cardValue: "—", suggestedValue: "Оцинковка", evidence: "Клиент попросил оцинковку, обсудили доплату.", severity: "low", status: "accepted" },
];

// ─────────────────────────────────────────────────────────────
async function main() {
  const driver = getDriverName();
  console.log(`[seed-demo] driver=${driver}, tenant=${DEMO_TENANT} (${DEMO_TENANT_NAME})`);

  // На SQLite нужно гарантировать что схема создана (db-compat создаёт своё соединение,
  // но миграции лежат в lib/db.ts → getDb()). На Postgres миграции запускаются лениво
  // внутри getDbAsync(). Чтобы не зависеть от гонки PG-миграций — каждую вставку оборачиваем
  // в try и сначала вычищаем старое.
  if (driver === "sqlite") {
    const { getDb } = await import("../src/lib/db");
    getDb(); // синхронно прогоняет SCHEMA_SQL + applyAlterMigrations
  }

  const db = getDbAsync();

  // На PG даём lazy-миграциям (fire-and-forget в makePgDb) шанс отработать.
  if (driver === "postgres" || driver === "pg") {
    await new Promise((r) => setTimeout(r, 1500));
  }

  // ── 1. ОЧИСТКА (идемпотентность) ──────────────────────────────
  console.log("[seed-demo] очистка прежних демо-данных...");
  // card_discrepancies по тенанту (оборачиваем в try — таблицы может не быть на старой SQLite).
  try {
    await db.prepare(`DELETE FROM card_discrepancies WHERE tenant_id = ?`).run(DEMO_TENANT);
  } catch (e) {
    console.warn("[seed-demo] пропуск очистки card_discrepancies:", (e as Error).message.split("\n")[0]);
  }
  // analyses + transcripts по call_id из calls тенанта 9999
  await db.prepare(
    `DELETE FROM analyses WHERE call_id IN (SELECT id FROM calls WHERE tenant_id = ?)`
  ).run(DEMO_TENANT);
  await db.prepare(
    `DELETE FROM transcripts WHERE call_id IN (SELECT id FROM calls WHERE tenant_id = ?)`
  ).run(DEMO_TENANT);
  await db.prepare(`DELETE FROM calls WHERE tenant_id = ?`).run(DEMO_TENANT);
  await db.prepare(`DELETE FROM managers WHERE tenant_id = ?`).run(DEMO_TENANT);
  await db.prepare(`DELETE FROM sales_scripts WHERE tenant_id = ?`).run(DEMO_TENANT);
  // удаляем сессии demo-пользователя и самого пользователя
  await db.prepare(
    `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)`
  ).run(DEMO_TENANT);
  await db.prepare(`DELETE FROM users WHERE tenant_id = ?`).run(DEMO_TENANT);

  // ── 2. ТЕНАНТ ─────────────────────────────────────────────────
  // tenants.id явно = 9999. На PG это SERIAL, но явная вставка id допустима.
  const tExists = await db.prepare(`SELECT id FROM tenants WHERE id = ?`).get(DEMO_TENANT);
  if (!tExists) {
    await db.prepare(
      `INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)`
    ).run(DEMO_TENANT, DEMO_TENANT_NAME, "demo-romashka");
  } else {
    await db.prepare(`UPDATE tenants SET name = ? WHERE id = ?`).run(DEMO_TENANT_NAME, DEMO_TENANT);
  }
  console.log(`[seed-demo] ✓ тенант ${DEMO_TENANT}`);

  // ── 3. DEMO-ПОЛЬЗОВАТЕЛЬ ──────────────────────────────────────
  // Хеш той же функцией, что login route (bcrypt.compare ↔ bcrypt.hash).
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await db.prepare(
    `INSERT INTO users (tenant_id, login, password_hash, role, name, is_active)
     VALUES (?, ?, ?, 'demo', ?, TRUE)`
  ).run(DEMO_TENANT, DEMO_LOGIN, hash, "Демо-доступ (ООО Ромашка)");
  console.log(`[seed-demo] ✓ пользователь login=${DEMO_LOGIN} (role=demo)`);

  // ── 4. МЕНЕДЖЕРЫ ──────────────────────────────────────────────
  for (const m of MANAGERS) {
    await db.prepare(
      `INSERT INTO managers (id, name, is_active, tenant_id) VALUES (?, ?, TRUE, ?)`
    ).run(m.id, m.name, DEMO_TENANT);
  }
  console.log(`[seed-demo] ✓ менеджеров: ${MANAGERS.length}`);

  // ── 5. СКРИПТЫ ────────────────────────────────────────────────
  await db.prepare(
    `INSERT INTO sales_scripts (name, content_md, is_active, checklist_json, product, direction, key_phrases, tenant_id)
     VALUES (?, ?, TRUE, ?, 'МП', 'all', ?, ?)`
  ).run(
    "Продажа модульных павильонов (МП)",
    "# Скрипт продажи модульных павильонов\n\nЦель — выявить задачу заказчика и продать павильон под ключ.\n\n1. Приветствие\n2. Выявление потребности (размер, назначение, сроки)\n3. Презентация выгод\n4. Отработка возражений\n5. Цена и условия\n6. Договорённость о следующем шаге.",
    JSON.stringify(checklistFor("МП")),
    "павильон\nмодуль\nпод ключ\nкиоск\nторговый павильон",
    DEMO_TENANT
  );
  await db.prepare(
    `INSERT INTO sales_scripts (name, content_md, is_active, checklist_json, product, direction, key_phrases, tenant_id)
     VALUES (?, ?, TRUE, ?, 'МК', 'all', ?, ?)`
  ).run(
    "Продажа металлоконструкций (МК)",
    "# Скрипт продажи металлоконструкций\n\nЦель — квалифицировать проект и довести до договора.\n\n1. Приветствие\n2. Выявление потребности (вес, проект, сроки)\n3. Презентация технологии\n4. Отработка возражений\n5. Цена и условия\n6. Договорённость о следующем шаге.",
    JSON.stringify(checklistFor("МК")),
    "металлоконструкции\nферма\nкаркас\nангар\nоцинковка",
    DEMO_TENANT
  );
  console.log("[seed-demo] ✓ скриптов: 2 (МП, МК)");

  // ── 6. ЗВОНКИ + АНАЛИЗЫ + ТРАНСКРИПТЫ ─────────────────────────
  // Запоминаем id созданных done-звонков с deal_id — к ним привяжем расхождения.
  const doneCallIdsWithDeal: number[] = [];
  let inserted = 0;
  for (let i = 0; i < PLAN.length; i++) {
    const c = PLAN[i];
    const started = startedAt(c.daysAgo, i);
    const bitrixCallId = `demo-${DEMO_TENANT}-${i + 1}`; // уникален (колонка UNIQUE)
    const bitrixDealId = c.withDeal ? String(50000 + i) : null;
    const recordingUrl = c.type === "call" && c.status === "done" && c.duration > 0
      ? `https://demo.local/rec/${bitrixCallId}.mp3`
      : null;

    const callRes = await db.prepare(
      `INSERT INTO calls
         (bitrix_call_id, bitrix_deal_id, manager_id, manager_name, client_phone, direction,
          started_at, duration_sec, recording_url, status, interaction_type, channel,
          detected_product, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bitrixCallId, bitrixDealId, c.manager.id, c.manager.name, c.client.phone, c.direction,
      started, c.duration, recordingUrl, c.status, c.type, c.channel,
      c.product, DEMO_TENANT
    );
    // Имя заказчика хранится в analyses.client_name (в таблице calls этой колонки нет) —
    // см. insertAnalysisAndTranscript: туда передаётся c.client.name.
    let callId = Number(callRes.lastInsertRowid);
    if (!callId || Number.isNaN(callId)) {
      // На некоторых конфигурациях lastInsertRowid может не вернуться — подстрахуемся выборкой.
      const row = await db.prepare(`SELECT id FROM calls WHERE bitrix_call_id = ?`).get<{ id: number }>(bitrixCallId);
      if (!row) { console.warn(`[seed-demo] не удалось получить id для ${bitrixCallId}, пропуск анализа`); continue; }
      callId = row.id;
    }
    await insertAnalysisAndTranscript(db, callId, c);
    if (c.status === "done" && c.withDeal) doneCallIdsWithDeal.push(callId);
    inserted++;
  }
  console.log(`[seed-demo] ✓ взаимодействий: ${inserted} (+анализы +транскрипты)`);

  // ── 7. РАСХОЖДЕНИЯ (card_discrepancies) ───────────────────────
  // Привязываем шаблоны к существующим done-звонкам с deal_id. Оборачиваем в try,
  // чтобы на чистой SQLite без таблицы seed не падал.
  let discInserted = 0;
  try {
    for (let i = 0; i < DISCREPANCY_TEMPLATES.length; i++) {
      const d = DISCREPANCY_TEMPLATES[i];
      const callId = doneCallIdsWithDeal[(i * 7) % doneCallIdsWithDeal.length];
      if (!callId) continue;
      await db.prepare(
        `INSERT INTO card_discrepancies
           (tenant_id, call_id, entity_type, entity_id, field_name, field_label,
            card_value, transcript_evidence, suggested_value, severity, status, ai_model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        DEMO_TENANT, callId, d.entityType, String(50000 + callId), d.fieldName, d.fieldLabel,
        d.cardValue, d.evidence, d.suggestedValue, d.severity, d.status, "demo-seed"
      );
      discInserted++;
    }
    console.log(`[seed-demo] ✓ расхождений: ${discInserted}`);
  } catch (e) {
    console.warn("[seed-demo] пропуск card_discrepancies (нет таблицы?):", (e as Error).message.split("\n")[0]);
  }

  await db.close();
  console.log("[seed-demo] ГОТОВО. Вход: /call-agent/demo (без пароля) либо login=test / пароль=test");
}

async function insertAnalysisAndTranscript(
  db: ReturnType<typeof getDbAsync>,
  callId: number,
  c: DemoCall
) {
  // Анализ — только для done (no_recording оставляем без анализа, как в реальности).
  if (c.status === "done") {
    await db.prepare(
      `INSERT INTO analyses
         (call_id, summary, sentiment, manager_score, script_compliance, next_action,
          objections_json, topics_json, client_name, checklist_scores_json,
          coaching_tips_json, call_stage, detected_product, model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      callId, c.summary, c.sentiment, c.score, c.compliance, c.nextAction,
      JSON.stringify(c.objections), JSON.stringify(topicsFor(c)), c.client.name,
      JSON.stringify(checklistScores(c.product, c.compliance)),
      JSON.stringify(coachingTips(c)), c.stage, c.product, "demo-seed"
    );

    // Транскрипт/диалог — для звонков с длительностью и для чатов/email/встреч.
    if (c.duration > 0 || c.type !== "call") {
      const dialogue = [
        { speaker: "manager", text: `Здравствуйте, это ${c.manager.name}, компания «Ромашка».` },
        { speaker: "client", text: c.product === "МП" ? "Интересует модульный павильон." : "Нужны металлоконструкции под проект." },
        { speaker: "manager", text: "Подскажите задачу и сроки — подберу оптимальный вариант." },
        { speaker: "client", text: c.objections[0] ? `Смущает, что ${c.objections[0]}.` : "Хорошо, расскажите подробнее." },
        { speaker: "manager", text: c.nextAction },
      ];
      const text = dialogue.map((d) => `${d.speaker === "manager" ? "Менеджер" : "Клиент"}: ${d.text}`).join("\n");
      await db.prepare(
        `INSERT INTO transcripts (call_id, text, dialogue_json, language, model)
         VALUES (?, ?, ?, 'ru', 'demo-seed')`
      ).run(callId, text, JSON.stringify(dialogue));
    }
  }
}

main().catch((e) => {
  console.error("[seed-demo] ОШИБКА:", e);
  process.exit(1);
});
