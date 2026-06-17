/**
 * seed-demo.ts — наполнение публичного ДЕМО-режима (витрина для клиентов).
 *
 * Создаёт изолированный тенант id=9999 «ООО Ромашка» с вымышленными, но
 * правдоподобными данными: 5 менеджеров, 2 скрипта, ~23 взаимодействия
 * (звонки/чаты/email/встреча) + анализы + транскрипты, и demo-пользователя
 * (login=test, role=demo) для входа без пароля через /call-agent/demo.
 *
 * Запуск (как остальные scripts — через tsx, см. package.json):
 *   npx tsx scripts/seed-demo.ts
 * На проде (Postgres) — заранее экспортировать DB_DRIVER=postgres и DATABASE_URL
 * (они и так в .env, loadEnv их подхватит).
 *
 * Идемпотентно: при каждом запуске сначала полностью удаляет данные тенанта 9999,
 * затем создаёт заново. Безопасно гонять сколько угодно раз.
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

// Менеджеры (Bitrix-id 900001..900005)
const MANAGERS = [
  { id: "900001", name: "Иванов Иван" },
  { id: "900002", name: "Петрова Анна" },
  { id: "900003", name: "Сидоров Пётр" },
  { id: "900004", name: "Кузнецова Мария" },
  { id: "900005", name: "Орлов Дмитрий" },
];

// Заказчики — повторяются у разных взаимодействий (чтобы в /clients были профили с историей).
const CLIENTS = [
  { name: "ООО СтройМир", phone: "+79001112201" },
  { name: "ИП Васильев", phone: "+79001112202" },
  { name: "ЗАО ТехноПром", phone: "+79001112203" },
  { name: "ООО Альфа-Строй", phone: "+79001112204" },
  { name: "Розница-Опт", phone: "+79001112205" },
  { name: "ООО ГрадМонтаж", phone: "+79001112206" },
  { name: "ИП Соколова", phone: "+79001112207" },
  { name: "ООО Запад", phone: "+79001112208" },
];

const OBJECTIONS = ["дорого", "посоветоваться", "работаем с другими", "не сезон"];
const TOPICS_MP = ["модульные павильоны", "сроки изготовления", "монтаж под ключ", "размеры", "цена за модуль"];
const TOPICS_MK = ["металлоконструкции", "вес конструкции", "проектная документация", "доставка", "оцинковка"];

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

// 23 взаимодействия. type-микс: 18 call / 2 chat / 2 email / 1 meeting.
// duration: большинство 60..600, 2 пропущенных (duration=0), статус 1 no_recording.
const PLAN: DemoCall[] = [
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 312, status: "done", client: CLIENTS[0], manager: MANAGERS[0], daysAgo: 0, product: "МП", sentiment: "positive", score: 8.5, compliance: 0.86, summary: "Презентовал модульный павильон 6×3 м, клиент заинтересован, запросил КП. Договорились о расчёте под ключ.", nextAction: "Отправить КП до завтра, перезвонить через 2 дня", stage: "qualification", objections: [], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "in", duration: 145, status: "done", client: CLIENTS[1], manager: MANAGERS[1], daysAgo: 0, product: "МК", sentiment: "neutral", score: 6, compliance: 0.62, summary: "Входящий по металлоконструкциям. Уточнял вес фермы и сроки. Менеджер не выявил бюджет.", nextAction: "Запросить чертёж, подготовить смету", stage: "cold", objections: ["посоветоваться"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 0, status: "no_recording", client: CLIENTS[2], manager: MANAGERS[2], daysAgo: 1, product: "МК", sentiment: "neutral", score: 0, compliance: 0, summary: "Недозвон — клиент не взял трубку.", nextAction: "Перезвонить через 1 день", stage: "no_contact", objections: [], withDeal: false },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 487, status: "done", client: CLIENTS[3], manager: MANAGERS[3], daysAgo: 1, product: "МП", sentiment: "positive", score: 9, compliance: 0.91, summary: "Отличный звонок: выявил потребность (павильон для летнего кафе), отработал «дорого» через рассрочку. Клиент готов к сделке.", nextAction: "Выставить счёт, согласовать монтаж на след. неделе", stage: "deal_followup", objections: ["дорого"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "in", duration: 78, status: "done", client: CLIENTS[4], manager: MANAGERS[0], daysAgo: 2, product: "МП", sentiment: "negative", score: 4, compliance: 0.4, summary: "Клиент недоволен сроками изготовления. Менеджер не смог удержать, разговор скомкан.", nextAction: "Эскалация РОПу, перезвонить с решением", stage: "qualification", objections: ["не сезон", "работаем с другими"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 256, status: "done", client: CLIENTS[5], manager: MANAGERS[1], daysAgo: 2, product: "МК", sentiment: "positive", score: 7.5, compliance: 0.78, summary: "Согласовали проект металлокаркаса ангара. Клиент попросил оцинковку, обсудили доплату.", nextAction: "Подготовить договор с учётом оцинковки", stage: "deal_followup", objections: [], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 198, status: "done", client: CLIENTS[6], manager: MANAGERS[2], daysAgo: 3, product: "МП", sentiment: "neutral", score: 6.5, compliance: 0.68, summary: "Повторный контакт по павильону. Клиент думает, попросил скидку.", nextAction: "Согласовать скидку 5% с руководителем", stage: "qualification", objections: ["дорого", "посоветоваться"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "in", duration: 423, status: "done", client: CLIENTS[7], manager: MANAGERS[3], daysAgo: 3, product: "МК", sentiment: "positive", score: 8, compliance: 0.83, summary: "Входящий по большому заказу металлоконструкций. Хорошая квалификация, бюджет подтверждён.", nextAction: "Назначить встречу с инженером", stage: "qualification", objections: [], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 0, status: "done", client: CLIENTS[0], manager: MANAGERS[4], daysAgo: 4, product: "МП", sentiment: "neutral", score: 3, compliance: 0.3, summary: "Дозвонился, но клиент попросил перезвонить позже. Короткий контакт.", nextAction: "Перезвонить завтра в 11:00", stage: "no_contact", objections: [], withDeal: false },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 367, status: "done", client: CLIENTS[1], manager: MANAGERS[0], daysAgo: 4, product: "МК", sentiment: "positive", score: 8.2, compliance: 0.88, summary: "Закрыл возражение «работаем с другими», показал преимущество по срокам. Клиент готов рассмотреть КП.", nextAction: "Отправить сравнительное КП", stage: "qualification", objections: ["работаем с другими"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "in", duration: 132, status: "done", client: CLIENTS[2], manager: MANAGERS[1], daysAgo: 5, product: "МП", sentiment: "neutral", score: 5.5, compliance: 0.55, summary: "Уточнял комплектацию павильона. Менеджер дал ответ, но не предложил следующий шаг чётко.", nextAction: "Уточнить потребность, выслать каталог", stage: "cold", objections: [], withDeal: false },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 289, status: "done", client: CLIENTS[3], manager: MANAGERS[2], daysAgo: 5, product: "МК", sentiment: "positive", score: 7.8, compliance: 0.8, summary: "Обсудили монтаж металлоконструкций на объекте, клиент доволен подходом.", nextAction: "Выезд замерщика в четверг", stage: "deal_followup", objections: [], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 521, status: "done", client: CLIENTS[4], manager: MANAGERS[3], daysAgo: 6, product: "МП", sentiment: "positive", score: 9.2, compliance: 0.93, summary: "Эталонный звонок: полная квалификация, презентация выгод, договорённость о сделке с датой.", nextAction: "Подписание договора в понедельник", stage: "deal_followup", objections: ["дорого"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "in", duration: 167, status: "done", client: CLIENTS[5], manager: MANAGERS[4], daysAgo: 6, product: "МК", sentiment: "negative", score: 4.5, compliance: 0.45, summary: "Жалоба на задержку доставки. Менеджер извинился, но решения не предложил.", nextAction: "Согласовать новую дату доставки, перезвонить", stage: "deal_followup", objections: ["не сезон"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 234, status: "done", client: CLIENTS[6], manager: MANAGERS[0], daysAgo: 7, product: "МП", sentiment: "neutral", score: 6.8, compliance: 0.7, summary: "Повторный контакт, клиент всё ещё выбирает. Нужно усилить аргументацию.", nextAction: "Отправить кейсы похожих проектов", stage: "qualification", objections: ["посоветоваться"], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 398, status: "done", client: CLIENTS[7], manager: MANAGERS[1], daysAgo: 8, product: "МК", sentiment: "positive", score: 8.4, compliance: 0.87, summary: "Согласовали спецификацию металлокаркаса. Клиент подтвердил готовность к договору.", nextAction: "Подготовить договор и счёт", stage: "deal_followup", objections: [], withDeal: true },
  { type: "call", channel: "bitrix_telephony", direction: "in", duration: 91, status: "done", client: CLIENTS[0], manager: MANAGERS[2], daysAgo: 9, product: "МП", sentiment: "neutral", score: 5, compliance: 0.5, summary: "Короткий входящий, уточнение цены. Без развития диалога.", nextAction: "Перезвонить с расчётом", stage: "cold", objections: ["дорого"], withDeal: false },
  { type: "call", channel: "bitrix_telephony", direction: "out", duration: 312, status: "done", client: CLIENTS[1], manager: MANAGERS[3], daysAgo: 10, product: "МК", sentiment: "positive", score: 7.6, compliance: 0.79, summary: "Хороший контакт по проекту ангара, клиент запросил проектную документацию.", nextAction: "Передать запрос проектировщикам", stage: "qualification", objections: [], withDeal: true },
  // ─── чаты (2) ───
  { type: "chat", channel: "openlines", direction: "in", duration: 0, status: "done", client: CLIENTS[2], manager: MANAGERS[4], daysAgo: 1, product: "МП", sentiment: "positive", score: 7, compliance: 0.72, summary: "Чат WhatsApp: клиент уточнил наличие павильонов 4×4, менеджер быстро ответил и предложил расчёт.", nextAction: "Отправить расчёт в чат", stage: "qualification", objections: [], withDeal: true },
  { type: "chat", channel: "openlines", direction: "in", duration: 0, status: "done", client: CLIENTS[5], manager: MANAGERS[0], daysAgo: 3, product: "МК", sentiment: "neutral", score: 6, compliance: 0.6, summary: "Чат Telegram: вопрос по весу конструкции. Ответ дан, но без призыва к действию.", nextAction: "Предложить созвон", stage: "cold", objections: ["посоветоваться"], withDeal: false },
  // ─── email (2) ───
  { type: "email", channel: "email_imap", direction: "in", duration: 0, status: "done", client: CLIENTS[3], manager: MANAGERS[1], daysAgo: 2, product: "МК", sentiment: "neutral", score: 6.5, compliance: 0.66, summary: "Входящее письмо с ТЗ на металлоконструкции. Менеджер ответил с уточняющими вопросами.", nextAction: "Получить ответы, подготовить смету", stage: "qualification", objections: [], withDeal: true },
  { type: "email", channel: "email_imap", direction: "out", duration: 0, status: "done", client: CLIENTS[7], manager: MANAGERS[2], daysAgo: 5, product: "МП", sentiment: "positive", score: 7.4, compliance: 0.75, summary: "Отправлено КП на модульный павильон. Письмо структурное, с выгодами и сроками.", nextAction: "Контрольный звонок через 2 дня", stage: "deal_followup", objections: [], withDeal: true },
  // ─── встреча (1) ───
  { type: "meeting", channel: "zoom", direction: "out", duration: 1680, status: "done", client: CLIENTS[4], manager: MANAGERS[3], daysAgo: 4, product: "МК", sentiment: "positive", score: 8.8, compliance: 0.9, summary: "Онлайн-встреча по крупному проекту металлоконструкций. Презентация, обсуждение этапов, бюджет согласован.", nextAction: "Подготовить договор поэтапной оплаты", stage: "deal_followup", objections: ["дорого"], withDeal: true },
];

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
  if (c.sentiment === "negative") tips.push("При негативе сначала присоединитесь к эмоции клиента, затем предложите решение.");
  if (tips.length === 0) tips.push("Сильный звонок — закрепите результат повторным касанием в срок.");
  return tips;
}

function topicsFor(c: DemoCall): string[] {
  const base = c.product === "МП" ? TOPICS_MP : TOPICS_MK;
  // 2-3 темы детерминированно
  const n = 2 + (c.duration % 2);
  return base.slice(0, n);
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
         (bitrix_call_id, bitrix_deal_id, manager_id, manager_name, client_phone, client_name, direction,
          started_at, duration_sec, recording_url, status, interaction_type, channel,
          detected_product, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bitrixCallId, bitrixDealId, c.manager.id, c.manager.name, c.client.phone, c.client.name, c.direction,
      started, c.duration, recordingUrl, c.status, c.type, c.channel,
      c.product, DEMO_TENANT
    );
    const callId = Number(callRes.lastInsertRowid);
    if (!callId || Number.isNaN(callId)) {
      // На некоторых конфигурациях lastInsertRowid может не вернуться — подстрахуемся выборкой.
      const row = await db.prepare(`SELECT id FROM calls WHERE bitrix_call_id = ?`).get<{ id: number }>(bitrixCallId);
      if (!row) { console.warn(`[seed-demo] не удалось получить id для ${bitrixCallId}, пропуск анализа`); continue; }
      await insertAnalysisAndTranscript(db, row.id, c);
    } else {
      await insertAnalysisAndTranscript(db, callId, c);
    }
    inserted++;
  }
  console.log(`[seed-demo] ✓ взаимодействий: ${inserted} (+анализы +транскрипты)`);

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
