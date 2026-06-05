import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Подгружаем .env и .env.local поверх системных переменных.
// Нужно потому что Next.js 16 + PM2 иногда стартует приложение в окружении
// где process.cwd() != директория проекта, и автозагрузка .env не срабатывает.
// Дополнительно ловим случаи когда переменная задана пустой строкой в shell.
const PROJECT_DIR = __dirname;
for (const fname of [".env", ".env.local"]) {
  const envPath = path.join(PROJECT_DIR, fname);
  if (!fs.existsSync(envPath)) continue;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // снимаем оборачивающие кавычки если есть
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && value) process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  basePath: "/call-agent",
  // КРИТИЧНО: nginx редиректит /call-agent → /call-agent/ (добавляет слэш),
  // а Next.js по умолчанию делал 308 /call-agent/ → /call-agent (убирал слэш) —
  // получалась бесконечная петля ERR_TOO_MANY_REDIRECTS. Эта опция отключает
  // автоматический trailing-slash редирект Next.js, разрывая цикл.
  skipTrailingSlashRedirect: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/sdk", "openai"],
};

export default nextConfig;
