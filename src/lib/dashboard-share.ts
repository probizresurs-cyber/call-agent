/**
 * Публичная ссылка на дашборд — токен хранится в tenants.settings.public_dashboard_token.
 * Любой кто знает URL `/public/dashboard/[token]` видит read-only дашборд тенанта.
 *
 * Безопасность: токен длиной 24 байта (192 бит) base64url-кодирован → 32 символа.
 * Бруте-форсить нереально. Отзыв = генерация нового токена (старый перестаёт работать).
 */
import crypto from "crypto";
import { getDbAsync } from "./db-compat";

/** Сгенерировать новый токен и сохранить в tenants.settings. Возвращает токен. */
export async function regenerateDashboardToken(tenantId: number): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const current = parseSettings(row?.settings) ?? {};
  const next = { ...current, public_dashboard_token: token };
  await db
    .prepare(`UPDATE tenants SET settings = ? WHERE id = ?`)
    .run(JSON.stringify(next), tenantId);
  return token;
}

/** Отозвать токен (удалить из settings). После этого `/public/dashboard/[token]` для любого токена не работает. */
export async function revokeDashboardToken(tenantId: number): Promise<void> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const current = parseSettings(row?.settings) ?? {};
  delete current.public_dashboard_token;
  await db
    .prepare(`UPDATE tenants SET settings = ? WHERE id = ?`)
    .run(JSON.stringify(current), tenantId);
}

/** Получить токен тенанта (или null если ещё не генерировался). */
export async function getDashboardToken(tenantId: number): Promise<string | null> {
  const db = getDbAsync();
  const row = await db
    .prepare(`SELECT settings FROM tenants WHERE id = ?`)
    .get<{ settings: unknown }>(tenantId);
  const s = parseSettings(row?.settings);
  return (s?.public_dashboard_token as string | undefined) ?? null;
}

/** Обратное преобразование: найти tenant по токену (для публичного роута). */
export async function resolveTenantByToken(token: string): Promise<number | null> {
  if (!token || token.length < 16) return null;
  const db = getDbAsync();
  // Сканируем все tenants — для одного тенанта это OK; на multi-tenant потом сделаем индекс
  const rows = await db
    .prepare(`SELECT id, settings FROM tenants`)
    .all<{ id: number; settings: unknown }>();
  for (const r of rows) {
    const s = parseSettings(r.settings);
    if (s?.public_dashboard_token === token) return Number(r.id);
  }
  return null;
}

function parseSettings(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  }
  return null;
}
