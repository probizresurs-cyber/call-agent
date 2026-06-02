import fs from "fs";
import path from "path";
import { defineConfig } from "drizzle-kit";

// Подтягиваем DATABASE_URL из .env без внешней зависимости (dotenv).
// Если переменная уже в окружении — используем её.
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) { process.env.DATABASE_URL = m[1].trim(); break; }
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  // Не падаем при импорте — drizzle-kit вызывает конфиг только при работе с БД
  console.warn("[drizzle.config] DATABASE_URL не задан — db:push/generate не сработают");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: url || "postgres://localhost/missing",
  },
  verbose: true,
  strict: true,
});
