import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Подгружаем .env.local поверх системных переменных (как в MarketRadar)
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key && value) process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  basePath: "/call-agent",
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["better-sqlite3", "@anthropic-ai/sdk", "openai"],
};

export default nextConfig;
