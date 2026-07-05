/**
 * Уведомления клиенту о низком балансе / приближении конца периода.
 * Канал: email (через внутренний эндпоинт MarketRadar) + платформа (баннер портала).
 * Напоминания за 7/5/3/2/1 день до конца периода; при пополнении/продлении — стоп.
 * НЕ шлём на наши внутренние аккаунты (CA_INTERNAL_EMAILS).
 */
import { getDbAsync } from "./db-compat";
import { getBalance, getTokenSettings, REMINDER_DAYS_BEFORE, type TokenSettings } from "./tokens";

let _tableReady = false;
async function ensureTable(): Promise<void> {
  if (_tableReady) return;
  const db = getDbAsync();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ca_billing_reminders (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      kind VARCHAR(16) NOT NULL,
      mark VARCHAR(32) NOT NULL,
      sent_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ca_billing_reminders_uniq ON ca_billing_reminders(tenant_id, kind, mark);
  `).catch(async () => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ca_billing_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        mark TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ca_billing_reminders_uniq ON ca_billing_reminders(tenant_id, kind, mark);
    `);
  });
  _tableReady = true;
}

async function alreadySent(tenantId: number, kind: string, mark: string): Promise<boolean> {
  await ensureTable();
  const r = await getDbAsync()
    .prepare("SELECT 1 AS x FROM ca_billing_reminders WHERE tenant_id = ? AND kind = ? AND mark = ? LIMIT 1")
    .get<{ x: number }>(tenantId, kind, mark);
  return !!r;
}
async function markSent(tenantId: number, kind: string, mark: string): Promise<void> {
  await ensureTable();
  await getDbAsync()
    .prepare("INSERT INTO ca_billing_reminders (tenant_id, kind, mark) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .run(tenantId, kind, mark)
    .catch(() => {});
}

function internalEmails(): Set<string> {
  const raw = process.env.CA_INTERNAL_EMAILS || "";
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** Кому слать: явный список из настроек ИЛИ админы/владельцы клиента, минус наши внутренние. */
export async function getRecipients(tenantId: number, settings: TokenSettings): Promise<string[]> {
  const internal = internalEmails();
  const valid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !internal.has(e.toLowerCase());

  if (settings.notifyEmails.length) {
    return [...new Set(settings.notifyEmails.map((e) => e.trim()).filter(valid))];
  }
  const rows = await getDbAsync()
    .prepare(`SELECT email FROM users WHERE tenant_id = ? AND role IN ('owner','admin') AND email IS NOT NULL AND email <> ''`)
    .all<{ email: string }>(tenantId);
  return [...new Set(rows.map((r) => (r.email || "").trim()).filter(valid))];
}

async function sendCaEmail(to: string[], subject: string, html: string): Promise<{ ok: boolean; sent: number }> {
  const url = process.env.MR_NOTIFY_URL;
  const secret = process.env.CA_NOTIFY_SECRET;
  if (!url || !secret || !to.length) return { ok: false, sent: 0 };
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CA-Notify-Secret": secret },
      body: JSON.stringify({ to, subject, html }),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: !!d.ok, sent: Number(d.sent || 0) };
  } catch {
    return { ok: false, sent: 0 };
  }
}

function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

function emailShell(title: string, bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#14171f">
    <h2 style="color:#5b4fc7;margin:0 0 12px">${title}</h2>
    ${bodyHtml}
    <p style="color:#8b8fa3;font-size:12px;margin-top:24px">Call-Agent · AI-анализ звонков. Это автоматическое уведомление по вашему аккаунту.</p>
  </div>`;
}

export interface ReminderResult { tenantId: number; kind: string; mark: string; recipients: number; emailSent: number }

/** Основной проход крона: по всем тенантам с включёнными уведомлениями. */
export async function runBillingReminders(): Promise<ReminderResult[]> {
  const db = getDbAsync();
  const tenants = await db.prepare("SELECT id, name FROM tenants WHERE is_active IS NOT FALSE").all<{ id: number; name: string }>();
  const out: ReminderResult[] = [];
  const today = todayIso();

  for (const t of tenants) {
    const settings = await getTokenSettings(t.id);
    if (!settings.notifyEnabled) continue;

    const recipients = await getRecipients(t.id, settings);
    if (!recipients.length) continue;

    // ── Конец периода: напоминания за 7/5/3/2/1 день ──
    if (settings.periodEnd) {
      const daysLeft = daysBetween(today, settings.periodEnd);
      if (daysLeft >= 0 && REMINDER_DAYS_BEFORE.includes(daysLeft)) {
        const mark = `${settings.periodEnd}:${daysLeft}`; // привязка к дате периода → при продлении старые метки не сработают
        if (!(await alreadySent(t.id, "period", mark))) {
          const dt = settings.periodEnd.split("-").reverse().join(".");
          const subject = `Call-Agent: период заканчивается через ${daysLeft} ${plural(daysLeft)}`;
          const html = emailShell("Ваш период скоро закончится", `
            <p>Здравствуйте!</p>
            <p>Оплаченный период доступа к Call-Agent для аккаунта <b>${escapeHtml(t.name)}</b> заканчивается
            <b>${dt}</b> — через ${daysLeft} ${plural(daysLeft)}.</p>
            <p>Продлите доступ, чтобы анализ звонков не прервался.</p>`);
          const res = await sendCaEmail(recipients, subject, html);
          await markSent(t.id, "period", mark);
          out.push({ tenantId: t.id, kind: "period", mark, recipients: recipients.length, emailSent: res.sent });
        }
      }
    }

    // ── Низкий баланс: одно письмо в сутки, пока баланс ≤ порога (при пополнении — стоп) ──
    const balance = await getBalance(t.id);
    if (balance <= settings.lowThreshold) {
      const mark = today; // раз в сутки
      if (!(await alreadySent(t.id, "balance", mark))) {
        const subject = `Call-Agent: токены на исходе (${balance})`;
        const html = emailShell("Токены на исходе", `
          <p>Здравствуйте!</p>
          <p>На аккаунте <b>${escapeHtml(t.name)}</b> в Call-Agent осталось <b>${balance}</b> токенов.</p>
          <p>Пополните баланс, чтобы анализ звонков не прервался.</p>`);
        const res = await sendCaEmail(recipients, subject, html);
        await markSent(t.id, "balance", mark);
        out.push({ tenantId: t.id, kind: "balance", mark, recipients: recipients.length, emailSent: res.sent });
      }
    }
  }
  return out;
}

function plural(n: number): string {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return "день";
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return "дня";
  return "дней";
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}
