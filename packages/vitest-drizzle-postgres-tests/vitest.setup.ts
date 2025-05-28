/// <reference types="vitest/globals" />

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, beforeEach } from "vitest";
import { cleanupTestDb, setupTestDb, useTestDb } from "vitest-drizzle-postgres";
import * as schema from "./src/schema";

// Ensure database exists before setupTestDb runs
async function ensureDatabaseExists() {
  const dbUrl =
    process.env.TEST_DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/test_vitest_drizzle";

  // Parse the database URL to get connection details
  const url = new URL(dbUrl);
  const dbName = url.pathname.slice(1); // Remove leading slash
  const baseUrl = `${url.protocol}//${url.username}:${url.password}@${url.host}/postgres`;

  // Connect to postgres database to create our test database if needed
  const adminPool = new Pool({ connectionString: baseUrl });
  const adminDb = drizzle(adminPool);

  try {
    // Check if database exists
    const result = await adminDb.execute(sql`
      SELECT 1 FROM pg_database WHERE datname = ${dbName}
    `);

    if (result.rows.length === 0) {
      console.log(`Creating database: ${dbName}`);
      // Create the database (note: we can't use parameterized queries for DDL)
      await adminDb.execute(sql.raw(`CREATE DATABASE "${dbName}"`));
    }
  } catch (error) {
    console.warn("Error checking/creating database:", error);
  } finally {
    await adminPool.end();
  }
}

// Ensure the database exists first
await ensureDatabaseExists();

// Create database connection for tests
const testPool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/test_vitest_drizzle",
});
const testDb = drizzle(testPool);

// Setup test database using our connection
await setupTestDb({
  schema,
  db: testDb,
  migrationsFolder: "./migrations",
});

beforeEach(async (ctx) => {
  await useTestDb(ctx);
});

afterEach(async () => {
  await cleanupTestDb();
});
