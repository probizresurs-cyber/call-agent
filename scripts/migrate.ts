import { getDb } from "../src/lib/db";

const db = getDb();
const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
  .all();
console.log("Tables:", tables);
console.log("✓ Migrations applied");
