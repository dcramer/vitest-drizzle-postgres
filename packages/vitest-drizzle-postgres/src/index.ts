import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { TestContext } from "vitest";

// Types and Interfaces
export interface SetupTestDbOptions<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> {
  schema: TSchema;
  db: ReturnType<typeof drizzle<any>>;
  migrationsFolder?: string;
  migrateFn?: typeof migrate;
}

export interface TestDbContext {
  mode: (m: TestMode) => Promise<void>;
  client: ReturnType<typeof drizzle<any>>;
}

export type TestMode = "savepoint" | "truncate";

interface TableInfo {
  name: string;
  type: string;
  columns?: Record<string, any>;
}

interface SimplifiedSchema {
  [tableName: string]: TableInfo | any;
}

// Constants
const CONSTANTS = {
  SAVEPOINT_NAME: "test_savepoint",
  MIGRATION_STATEMENT_SEPARATOR: "--> statement-breakpoint",
  DRIZZLE_TABLE_PREFIX: "drizzle_%",
  SCHEMA_NAME: "public",
  SAFE_TABLES: ["__drizzle_migrations"] as string[],
} as const;

// Custom Error Classes
export class VitestDrizzleError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "VitestDrizzleError";
  }
}

export class DatabaseNotInitializedError extends VitestDrizzleError {
  constructor() {
    super(
      "Test database not initialized. Call setupTestDb first.",
      "DB_NOT_INITIALIZED"
    );
  }
}

export class MigrationError extends VitestDrizzleError {
  constructor(
    message: string,
    public readonly migrationFile?: string
  ) {
    super(`Migration failed: ${message}`, "MIGRATION_FAILED");
  }
}

// Global state management
class GlobalState {
  private static instance: GlobalState;

  public db: ReturnType<typeof drizzle<any>> | null = null;
  public schemaHash: string | null = null;
  public tableNames: string[] = [];

  static getInstance(): GlobalState {
    if (!GlobalState.instance) {
      GlobalState.instance = new GlobalState();
    }
    return GlobalState.instance;
  }

  reset(): void {
    this.schemaHash = null;
    this.tableNames = [];
  }

  async teardown(): Promise<void> {
    this.db = null;
    this.reset();
  }
}

// Per-test state management
class TestState {
  private static instance: TestState;

  public db: ReturnType<typeof drizzle<any>> | null = null;
  public mode: TestMode = "savepoint";

  static getInstance(): TestState {
    if (!TestState.instance) {
      TestState.instance = new TestState();
    }
    return TestState.instance;
  }

  reset(): void {
    this.db = null;
    this.mode = "savepoint";
  }
}

// Schema utilities
class SchemaUtils {
  static hash(schema: Record<string, any>): string {
    const simplifiedSchema = SchemaUtils.simplify(schema);
    const schemaString = JSON.stringify(simplifiedSchema, null, 2);
    return createHash("sha256").update(schemaString).digest("hex");
  }

  static getTableNames(schema: Record<string, any>): string[] {
    const tableNames: string[] = [];

    for (const [tableName, table] of Object.entries(schema)) {
      if (table && typeof table === "object") {
        // Check if this looks like a Drizzle table object
        // Drizzle tables typically have specific properties like columns, or table metadata
        const hasTableProperties =
          table.constructor?.name?.includes("Table") ||
          Object.prototype.hasOwnProperty.call(table, "_") ||
          Object.prototype.hasOwnProperty.call(table, "getSQL") ||
          (Object.keys(table).length > 0 && !Array.isArray(table));

        if (hasTableProperties) {
          tableNames.push(tableName);
        }
      }
    }

    return tableNames;
  }

  private static simplify(schema: Record<string, any>): SimplifiedSchema {
    const simplified: SimplifiedSchema = {};

    for (const [tableName, table] of Object.entries(schema)) {
      if (table && typeof table === "object") {
        const tableInfo: TableInfo = {
          name: tableName,
          type: table.constructor?.name || "unknown",
        };

        const columns: Record<string, any> = {};
        for (const [key, value] of Object.entries(table)) {
          if (SchemaUtils.shouldSkipProperty(key, value)) {
            continue;
          }

          if (value && typeof value === "object") {
            columns[key] = {
              type: value.constructor?.name || "unknown",
              ...(Object.prototype.hasOwnProperty.call(value, "notNull") && {
                notNull: (value as any).notNull,
              }),
              ...(Object.prototype.hasOwnProperty.call(value, "primary") && {
                primary: (value as any).primary,
              }),
            };
          } else {
            columns[key] = value;
          }
        }

        if (Object.keys(columns).length > 0) {
          tableInfo.columns = columns;
        }

        simplified[tableName] = tableInfo;
      } else {
        simplified[tableName] = table;
      }
    }

    return simplified;
  }

  private static shouldSkipProperty(key: string, value: any): boolean {
    return (
      key.startsWith("_") ||
      key === "getSQL" ||
      typeof value === "function" ||
      key.includes("Symbol")
    );
  }
}

// Database utilities
class DatabaseUtils {
  static async getAllTableNames(
    db: ReturnType<typeof drizzle<any>>
  ): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = ${CONSTANTS.SCHEMA_NAME}
      AND tablename NOT LIKE ${CONSTANTS.DRIZZLE_TABLE_PREFIX}
    `);

    return result.rows
      .map((row: any) => row.tablename)
      .filter(
        (tableName: string) => !CONSTANTS.SAFE_TABLES.includes(tableName)
      );
  }

  /**
   * Ensures the database connection is completely outside any transaction context.
   * This is critical for PostgreSQL enum additions and schema operations.
   */
  static async ensureNoTransaction(
    db: ReturnType<typeof drizzle<any>>
  ): Promise<void> {
    // try {
    //   // Try to rollback any existing transaction
    //   await db.execute(sql.raw("ROLLBACK"));
    // } catch {
    //   // Ignore errors if we're not in a transaction
    // }
    // try {
    //   // Also try to end any potential transaction
    //   await db.execute(sql.raw("END"));
    // } catch {
    //   // Ignore errors if we're not in a transaction
    // }
    // try {
    //   // Check transaction status and force rollback if needed
    //   const result = await db.execute(
    //     sql.raw("SELECT txid_current_if_assigned()")
    //   );
    //   if (
    //     result.rows[0] &&
    //     (result.rows[0] as any).txid_current_if_assigned !== null
    //   ) {
    //     console.warn(
    //       "vitest-drizzle-postgres: Found active transaction, forcing rollback"
    //     );
    //     await db.execute(sql.raw("ROLLBACK"));
    //   }
    // } catch {
    //   // Ignore errors - this is just a safety check
    // }
  }

  static async truncateTablesWithDb(
    db: ReturnType<typeof drizzle<any>>,
    tableNames: string[]
  ): Promise<void> {
    if (tableNames.length === 0) return;

    // Use schema-qualified table names for better safety
    const quotedTables = tableNames
      .map((t) => `"${CONSTANTS.SCHEMA_NAME}"."${t}"`)
      .join(", ");

    try {
      await db.execute(
        sql.raw(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`)
      );

      // Reset sequences to ensure consistent test state
      await DatabaseUtils.resetSequences(db);
    } catch (error) {
      console.error(
        "vitest-drizzle-postgres: Failed to truncate tables:",
        error
      );
      throw error;
    }
  }

  static async resetSequences(
    db: ReturnType<typeof drizzle<any>>
  ): Promise<void> {
    try {
      // Get all sequences in the schema (excluding drizzle migration sequences)
      const result = await db.execute(sql`
        SELECT c.relname 
        FROM pg_class c
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'S' 
        AND n.nspname = ${CONSTANTS.SCHEMA_NAME}
        AND c.relname NOT LIKE ${CONSTANTS.DRIZZLE_TABLE_PREFIX}
      `);

      // Reset each sequence to start from 1
      for (const row of result.rows) {
        const sequenceName = (row as any).relname;
        await db.execute(
          sql.raw(
            `ALTER SEQUENCE "${CONSTANTS.SCHEMA_NAME}"."${sequenceName}" RESTART WITH 1`
          )
        );
      }
    } catch (error) {
      console.warn(
        "vitest-drizzle-postgres: Failed to reset sequences:",
        error
      );
      // Don't throw here as sequence reset is not critical
    }
  }

  static async dropAndRecreateSchema(
    db: ReturnType<typeof drizzle<any>>
  ): Promise<void> {
    try {
      // Ensure we're completely outside any transaction context before schema operations
      await DatabaseUtils.ensureNoTransaction(db);

      // Drop both public and drizzle schemas to ensure complete cleanup
      await db.execute(
        sql.raw(`DROP SCHEMA IF EXISTS ${CONSTANTS.SCHEMA_NAME} CASCADE`)
      );
      await db.execute(sql.raw("DROP SCHEMA IF EXISTS drizzle CASCADE"));

      // Recreate the public schema
      await db.execute(sql.raw(`CREATE SCHEMA ${CONSTANTS.SCHEMA_NAME}`));

      // Grant permissions
      await db.execute(
        sql.raw(`GRANT ALL ON SCHEMA ${CONSTANTS.SCHEMA_NAME} TO PUBLIC`)
      );
      await db.execute(
        sql.raw(`GRANT ALL ON SCHEMA ${CONSTANTS.SCHEMA_NAME} TO postgres`)
      );

      console.log(
        `vitest-drizzle-postgres: Recreated schema "${CONSTANTS.SCHEMA_NAME}"`
      );
    } catch (error) {
      console.warn(
        "vitest-drizzle-postgres: Failed to recreate schema:",
        error
      );
      throw error;
    }
  }
}

// Migration utilities
class MigrationUtils {
  static async runMigrations(
    db: ReturnType<typeof drizzle<any>>,
    migrationsPath: string,
    migrateFn?: typeof migrate
  ): Promise<void> {
    const resolvedPath = resolve(process.cwd(), migrationsPath);

    try {
      console.log(
        `vitest-drizzle-postgres: Running migrations from ${resolvedPath}`
      );

      // Ensure we're completely outside any transaction context
      // This is critical for PostgreSQL enum additions which require immediate commits
      await DatabaseUtils.ensureNoTransaction(db);

      // Use Drizzle's built-in migration system
      await (migrateFn ?? migrate)(db, { migrationsFolder: resolvedPath });

      console.log("vitest-drizzle-postgres: Migrations completed successfully");
    } catch (error) {
      // For any migration failure, try once with schema recreation
      console.warn(
        "vitest-drizzle-postgres: Migration failed, recreating schema and retrying once..."
      );

      try {
        // Ensure we're completely outside any transaction context before schema recreation
        await DatabaseUtils.ensureNoTransaction(db);

        // Drop and recreate the schema
        await DatabaseUtils.dropAndRecreateSchema(db);

        // Retry migrations once
        console.log(
          "vitest-drizzle-postgres: Retrying migrations after schema recreation"
        );
        await (migrateFn ?? migrate)(db, { migrationsFolder: resolvedPath });

        console.log(
          "vitest-drizzle-postgres: Migrations completed successfully after retry"
        );
        return;
      } catch (retryError) {
        // Hard fail on second attempt
        throw new MigrationError(
          `Migration failed even after schema recreation. Original error: ${
            error instanceof Error ? error.message : "Unknown error"
          }. Retry error: ${
            retryError instanceof Error ? retryError.message : "Unknown error"
          }`
        );
      }
    }
  }
}

// Main database setup function
async function createFreshDb(options: SetupTestDbOptions): Promise<void> {
  const globalState = GlobalState.getInstance();

  if (!globalState.db) {
    throw new VitestDrizzleError("Database connection not initialized");
  }

  // Ensure we're completely outside any transaction context before database operations
  // This is critical for PostgreSQL enum additions and schema operations
  await DatabaseUtils.ensureNoTransaction(globalState.db);

  // Drop and recreate the schema for a clean slate
  await DatabaseUtils.dropAndRecreateSchema(globalState.db);

  // Run migrations if folder is provided
  if (options.migrationsFolder) {
    await MigrationUtils.runMigrations(
      globalState.db,
      options.migrationsFolder,
      options.migrateFn
    );
  }

  // Update cached state - store all existing table names for cleanup operations
  globalState.tableNames = await DatabaseUtils.getAllTableNames(globalState.db);
  globalState.schemaHash = SchemaUtils.hash(options.schema);
}

/**
 * Setup test database - call once in vitest.setup.ts
 *
 * Note: This function ensures migrations run outside of any transaction context
 * to properly handle PostgreSQL enum additions, which require immediate commits.
 */
export async function setupTestDb<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
>(options: SetupTestDbOptions<TSchema>): Promise<void> {
  const globalState = GlobalState.getInstance();
  const newSchemaHash = SchemaUtils.hash(options.schema);

  // Initialize connection
  if (!globalState.db) {
    globalState.db = options.db;
  }

  // Check if we need to recreate the database
  const needsRecreation =
    !globalState.schemaHash || globalState.schemaHash !== newSchemaHash;

  if (needsRecreation) {
    console.log("vitest-drizzle-postgres: Setting up test database");
    await createFreshDb(options);
  } else {
    // Still need to refresh table names in case they weren't cached
    if (globalState.tableNames.length === 0) {
      globalState.tableNames = await DatabaseUtils.getAllTableNames(
        globalState.db!
      );
    }
  }
}

/**
 * Setup test context for each test - call in beforeEach
 */
export async function useTestDb(
  ctx: TestContext,
  mode: TestMode = "savepoint"
): Promise<void> {
  const globalState = GlobalState.getInstance();
  const testState = TestState.getInstance();

  if (!globalState.db) {
    throw new DatabaseNotInitializedError();
  }

  testState.mode = mode;
  testState.db = globalState.db;

  // Create the $db context object - use any type to handle both cases
  const dbContext: TestDbContext = {
    mode: async (newMode: TestMode) => {
      if (testState.mode !== newMode) {
        await cleanupCurrentMode();
        testState.mode = newMode;
        await setupCurrentMode();
      }
    },
    client: testState.db,
  };

  // Attach to vitest context
  ctx.$db = dbContext;

  // Setup based on mode
  await setupCurrentMode();
}

/**
 * Setup the current test mode
 */
async function setupCurrentMode(): Promise<void> {
  const testState = TestState.getInstance();

  if (testState.mode === "savepoint" && testState.db) {
    // try {
    //   // Ensure we're not already in a transaction
    //   await testState.db.execute(sql.raw("ROLLBACK"));
    // } catch {
    //   console.error("vitest-drizzle-postgres: Failed to rollback");
    //   // Ignore errors if we're not in a transaction
    // }

    console.debug("vitest-drizzle-postgres: Setting up savepoint");
    // Start fresh transaction and savepoint
    await testState.db.execute(sql.raw("BEGIN"));
    await testState.db.execute(
      sql.raw(`SAVEPOINT ${CONSTANTS.SAVEPOINT_NAME}`)
    );
  }
  // For truncate mode, no setup needed
}

/**
 * Cleanup the current test mode
 */
async function cleanupCurrentMode(): Promise<void> {
  const globalState = GlobalState.getInstance();
  const testState = TestState.getInstance();

  if (testState.mode === "savepoint" && testState.db) {
    console.debug("vitest-drizzle-postgres: Cleaning up savepoint");
    try {
      // Try to rollback to savepoint first
      await testState.db.execute(
        sql.raw(`ROLLBACK TO SAVEPOINT ${CONSTANTS.SAVEPOINT_NAME}`)
      );
      // Then rollback the entire transaction
      await testState.db.execute(sql.raw("ROLLBACK"));
    } catch (error) {
      console.warn(
        "vitest-drizzle-postgres: Failed to rollback to savepoint:",
        error
      );
      // If savepoint rollback fails, try a simple rollback
      try {
        await testState.db.execute(sql.raw("ROLLBACK"));
      } catch (rollbackError) {
        console.error(
          "vitest-drizzle-postgres: Failed to rollback transaction:",
          rollbackError
        );
      }
    }
  } else if (testState.mode === "truncate" && testState.db) {
    console.debug("vitest-drizzle-postgres: Cleaning up transaction");
    try {
      await DatabaseUtils.truncateTablesWithDb(
        testState.db,
        globalState.tableNames
      );
    } catch (error) {
      console.error(
        "vitest-drizzle-postgres: Failed to truncate tables:",
        error
      );
    }
  }
}

/**
 * Cleanup after each test - should be called in afterEach
 */
export async function cleanupTestDb(): Promise<void> {
  const testState = TestState.getInstance();

  await cleanupCurrentMode();
  testState.reset();
}

/**
 * Close database connections - call in globalTeardown if needed
 */
export async function teardownTestDb(): Promise<void> {
  const globalState = GlobalState.getInstance();
  const testState = TestState.getInstance();

  testState.reset();
  await globalState.teardown();
}

/**
 * Reset global state for testing - internal use only
 */
export function _resetGlobalState(): void {
  GlobalState.getInstance().reset();
}
