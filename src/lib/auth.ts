import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getDb } from "./db";

const COOKIE_NAME = "ca_session";
const SESSION_TTL_HOURS = 24 * 14;

export type SessionUser = { user: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT user, expires_at FROM sessions WHERE id = ? AND expires_at > datetime('now')`
    )
    .get(token) as { user: string; expires_at: string } | undefined;
  if (!row) return null;
  return { user: row.user };
}

export async function login(loginRaw: string, password: string): Promise<boolean> {
  const expectedLogin = process.env.ADMIN_LOGIN || "";
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!expectedLogin || !expectedHash) {
    throw new Error("ADMIN_LOGIN / ADMIN_PASSWORD_HASH не заданы в .env");
  }
  if (loginRaw.trim() !== expectedLogin) return false;
  const ok = await bcrypt.compare(password, expectedHash);
  if (!ok) return false;

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000);
  getDb()
    .prepare(`INSERT INTO sessions (id, user, expires_at) VALUES (?, ?, ?)`)
    .run(token, expectedLogin, expires.toISOString().replace("T", " ").slice(0, 19));

  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/call-agent",
    expires,
  });
  return true;
}

export async function logout() {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (token) {
    getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(token);
  }
  c.delete(COOKIE_NAME);
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new Response("Unauthorized", { status: 401 });
  return u;
}
