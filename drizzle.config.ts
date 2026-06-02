import "dotenv/config";
import { defineConfig } from "drizzle-kit";

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
