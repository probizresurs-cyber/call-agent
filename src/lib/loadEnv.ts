/**
 * Явная загрузка .env (и .env.local) в process.env.
 * Нужно для скриптов которые запускаются не через Next.js
 * (worker.ts, migrate.ts) — у них нет автозагрузки .env.
 *
 * Идемпотентно: уже заданные переменные не перетираем.
 */
import fs from "fs";
import path from "path";

let loaded = false;

export function loadEnv(projectDir?: string): void {
  if (loaded) return;
  const dir = projectDir || process.cwd();
  for (const fname of [".env", ".env.local"]) {
    const p = path.join(dir, fname);
    if (!fs.existsSync(p)) continue;
    try {
      for (const raw of fs.readFileSync(p, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        let v = line.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k && v && !process.env[k]) process.env[k] = v;
      }
    } catch (e) {
      console.warn(`[loadEnv] не удалось прочитать ${p}:`, (e as Error).message);
    }
  }
  loaded = true;
}
