import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error("Error: DATABASE_URL must be configured in production environment to run migrations.");
      process.exit(1);
    }
    console.log("DATABASE_URL not set in non-production environment. Skipping PostgreSQL migrations.");
    process.exit(0);
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  });

  try {
    // 1. Ensure migrations tracking table exists
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // 2. Discover migration files
    const migrationsDir = path.resolve(process.cwd(), "db/migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log(`Migrations directory ${migrationsDir} does not exist. Nothing to apply.`);
      await sql.end();
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    // 3. Fetch already applied migrations
    const appliedRows = await sql`SELECT name FROM schema_migrations`;
    const appliedSet = new Set(appliedRows.map((r) => r.name));

    // 4. Apply pending migrations in order
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`- Migration already applied: ${file}`);
        continue;
      }

      console.log(`+ Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, "utf8");

      await sql.begin(async (tx) => {
        await tx.unsafe(sqlContent);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });

      console.log(`✓ Successfully applied: ${file}`);
    }

    console.log("All migrations are up to date.");
  } catch (error) {
    console.error("Migration failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
