import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describe, expect, test } from "vitest";
import {
  _resetGlobalState,
  cleanupTestDb,
  setupTestDb,
  teardownTestDb,
  useTestDb,
} from "vitest-drizzle-postgres";
import { testUsers } from "../src/schema";
import * as schema from "../src/schema";

describe("Error Handling", () => {
  test("should throw error when useTestDb called without setupTestDb", async () => {
    // Temporarily teardown the existing setup
    await teardownTestDb();

    // Create a mock context
    const mockCtx = {} as any;

    // This should throw an error since setupTestDb wasn't called
    await expect(useTestDb(mockCtx)).rejects.toThrow(
      "Test database not initialized. Call setupTestDb first."
    );

    // Restore the setup for other tests
    const testPool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/test_vitest_drizzle",
    });
    const testDb = drizzle(testPool);

    await setupTestDb({
      schema,
      db: testDb,
      migrationsFolder: "./migrations",
    });
  });

  test("should handle cleanup gracefully when no test client exists", async () => {
    // This should not throw an error even if no test client is active
    await expect(cleanupTestDb()).resolves.not.toThrow();
  });

  test("should handle database connection errors gracefully", async (ctx) => {
    const db = ctx.$db.client;

    // Test that we can handle database errors without crashing
    await expect(db.execute(sql`INVALID SQL STATEMENT`)).rejects.toThrow();

    // After an error in a transaction, we need to rollback and start fresh
    // The cleanup will handle this, so let's clean up and restart
    await cleanupTestDb();
    await useTestDb(ctx);

    // Now the connection should work
    const result = await db.execute(sql`SELECT 1 as test`);
    expect(result.rows[0]).toEqual({ test: 1 });
  });

  test("should handle mode switching errors gracefully", async (ctx) => {
    const db = ctx.$db.client;

    // Insert some data using proper drizzle syntax
    await db.insert(testUsers).values({
      name: "Test User",
      email: "test@example.com",
      age: 25,
    });

    // Switch modes multiple times - should not cause issues
    await ctx.$db.mode("truncate");
    await ctx.$db.mode("savepoint");
    await ctx.$db.mode("truncate");

    // Should still be able to query
    const users = await db.select().from(testUsers);
    expect(Array.isArray(users)).toBe(true);
  });
});
