const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./migrations" });
    console.log("Database migrations completed.");
  } finally { await pool.end(); }
})().catch(() => { console.error("Database migration failed."); process.exit(1); });
