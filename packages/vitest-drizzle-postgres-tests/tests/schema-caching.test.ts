import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describe, expect, test, vi } from "vitest";
import { _resetGlobalState, setupTestDb } from "vitest-drizzle-postgres";
import * as schema from "../src/schema";

describe("Schema Caching", () => {
  test("should detect schema changes", async () => {
    // Reset global state to simulate first run
    _resetGlobalState();

    // Create database connection
    const testPool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/test_vitest_drizzle",
    });
    const testDb = drizzle(testPool);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // First setup with original schema
    await setupTestDb({
      schema,
      db: testDb,
      migrationsFolder: "./migrations",
    });

    // Should log that it's setting up the database (first run or schema change)
    expect(consoleSpy).toHaveBeenCalledWith(
      "vitest-drizzle-postgres: Setting up test database"
    );

    consoleSpy.mockClear();

    // Second setup with same schema
    await setupTestDb({
      schema,
      db: testDb,
      migrationsFolder: "./migrations",
    });

    // Should not log setup message since schema is unchanged
    expect(consoleSpy).not.toHaveBeenCalledWith(
      "vitest-drizzle-postgres: Setting up test database"
    );

    consoleSpy.mockRestore();
    await testPool.end();
  });

  test("should recreate database when schema changes", async () => {
    // Create database connection
    const testPool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/test_vitest_drizzle",
    });
    const testDb = drizzle(testPool);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Setup with original schema
    await setupTestDb({
      schema,
      db: testDb,
      migrationsFolder: "./migrations",
    });

    consoleSpy.mockClear();

    // Create a modified schema (add a field)
    const modifiedSchema = {
      ...schema,
      testUsers: {
        ...schema.testUsers,
        // This simulates a schema change
        newField: "modified",
      },
    };

    // Setup with modified schema
    await setupTestDb({
      schema: modifiedSchema,
      db: testDb,
      migrationsFolder: "./migrations",
    });

    // Should detect the change and recreate
    expect(consoleSpy).toHaveBeenCalledWith(
      "vitest-drizzle-postgres: Setting up test database"
    );

    consoleSpy.mockRestore();
    await testPool.end();
  });
});
