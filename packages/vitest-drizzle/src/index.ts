import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import type { TestContext } from "vitest";

// Types and Interfaces
export interface SetupTestDbOptions {
  schema: Record<string, any>;
  url: string;
  migrationsFolder?: string;
}

export interface TestDbContext {
  mode: (m: TestMode) => Promise<void>;
  client: ReturnType<typeof drizzle>;
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

  public db: ReturnType<typeof drizzle> | null = null;
  public pool: Pool | null = null;
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
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this.db = null;
    this.reset();
  }
}

// Per-test state management
class TestState {
  private static instance: TestState;

  public client: PoolClient | null = null;
  public db: ReturnType<typeof drizzle> | null = null;
  public mode: TestMode = "savepoint";

  static getInstance(): TestState {
    if (!TestState.instance) {
      TestState.instance = new TestState();
    }
    return TestState.instance;
  }

  reset(): void {
    this.client = null;
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
  static async getTableNames(
    db: ReturnType<typeof drizzle>
  ): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = ${CONSTANTS.SCHEMA_NAME}
      AND tablename NOT LIKE ${CONSTANTS.DRIZZLE_TABLE_PREFIX}
    `);
    return result.rows.map((row: any) => row.tablename);
  }

  static async dropAllTables(
    db: ReturnType<typeof drizzle>,
    tableNames: string[]
  ): Promise<void> {
    if (tableNames.length === 0) return;

    const quotedTables = tableNames.map((t) => `"${t}"`).join(", ");
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${quotedTables} CASCADE`));
  }

  static async truncateTables(
    client: PoolClient,
    tableNames: string[]
  ): Promise<void> {
    if (tableNames.length === 0) return;

    const quotedTables = tableNames.map((t) => `"${t}"`).join(", ");
    await client.query(
      `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`
    );
  }
}

// Migration utilities
class MigrationUtils {
  static async runMigrations(
    db: ReturnType<typeof drizzle>,
    migrationsPath: string
  ): Promise<void> {
    const resolvedPath = resolve(process.cwd(), migrationsPath);

    try {
      const migrationFiles = readdirSync(resolvedPath)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      if (migrationFiles.length === 0) {
        console.log("vitest-drizzle: No migrations found");
        return;
      }

      console.log(
        `vitest-drizzle: Running ${migrationFiles.length} migration(s)`
      );

      for (const file of migrationFiles) {
        await MigrationUtils.executeMigrationFile(db, resolvedPath, file);
      }
    } catch (error) {
      throw new MigrationError(
        error instanceof Error ? error.message : "Unknown migration error"
      );
    }
  }

  private static async executeMigrationFile(
    db: ReturnType<typeof drizzle>,
    migrationsPath: string,
    filename: string
  ): Promise<void> {
    const filePath = resolve(migrationsPath, filename);
    const migrationSql = readFileSync(filePath, "utf8");

    const statements = migrationSql
      .split(CONSTANTS.MIGRATION_STATEMENT_SEPARATOR)
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await db.execute(sql.raw(statement));
        } catch (error) {
          throw new MigrationError(
            `Failed to execute statement in ${filename}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
            filename
          );
        }
      }
    }
  }
}

// Main database setup function
async function createFreshDb(options: SetupTestDbOptions): Promise<void> {
  const globalState = GlobalState.getInstance();

  if (!globalState.pool || !globalState.db) {
    throw new VitestDrizzleError("Database connection not initialized");
  }

  // Drop all existing tables
  const existingTables = await DatabaseUtils.getTableNames(globalState.db);

  if (existingTables.length > 0) {
    await DatabaseUtils.dropAllTables(globalState.db, existingTables);
  }

  // Run migrations if folder is provided
  if (options.migrationsFolder) {
    await MigrationUtils.runMigrations(
      globalState.db,
      options.migrationsFolder
    );
  }

  // Update cached state
  globalState.tableNames = await DatabaseUtils.getTableNames(globalState.db);
  globalState.schemaHash = SchemaUtils.hash(options.schema);
}

/**
 * Setup test database - call once in vitest.setup.ts
 */
export async function setupTestDb(options: SetupTestDbOptions): Promise<void> {
  const globalState = GlobalState.getInstance();
  const newSchemaHash = SchemaUtils.hash(options.schema);

  // Initialize connection if not exists
  if (!globalState.pool) {
    globalState.pool = new Pool({ connectionString: options.url });
    globalState.db = drizzle(globalState.pool);
  }

  // Check if we need to recreate the database
  const needsRecreation =
    !globalState.schemaHash || globalState.schemaHash !== newSchemaHash;

  if (needsRecreation) {
    console.log("vitest-drizzle: Setting up test database");
    await createFreshDb(options);
  } else {
    // Still need to refresh table names in case they weren't cached
    if (globalState.tableNames.length === 0) {
      globalState.tableNames = await DatabaseUtils.getTableNames(
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

  if (!globalState.pool) {
    throw new DatabaseNotInitializedError();
  }

  testState.mode = mode;

  // Get a dedicated client for this test
  testState.client = await globalState.pool.connect();
  testState.db = drizzle(testState.client);

  // Create the $db context object
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
  (ctx as any).$db = dbContext;

  // Setup based on mode
  await setupCurrentMode();
}

/**
 * Setup the current test mode
 */
async function setupCurrentMode(): Promise<void> {
  const testState = TestState.getInstance();

  if (!testState.client) return;

  if (testState.mode === "savepoint") {
    await testState.client.query("BEGIN");
    await testState.client.query(`SAVEPOINT ${CONSTANTS.SAVEPOINT_NAME}`);
  }
  // For truncate mode, no setup needed
}

/**
 * Cleanup the current test mode
 */
async function cleanupCurrentMode(): Promise<void> {
  const globalState = GlobalState.getInstance();
  const testState = TestState.getInstance();

  if (!testState.client) return;

  if (testState.mode === "savepoint") {
    try {
      await testState.client.query(
        `ROLLBACK TO SAVEPOINT ${CONSTANTS.SAVEPOINT_NAME}`
      );
      await testState.client.query("ROLLBACK");
    } catch (error) {
      // Try a simple rollback if savepoint fails
      try {
        await testState.client.query("ROLLBACK");
      } catch (rollbackError) {
        console.warn(
          "vitest-drizzle: Failed to rollback transaction:",
          rollbackError
        );
      }
    }
  } else if (testState.mode === "truncate") {
    try {
      await DatabaseUtils.truncateTables(
        testState.client,
        globalState.tableNames
      );
    } catch (error) {
      console.warn("vitest-drizzle: Failed to truncate tables:", error);
    }
  }
}

/**
 * Cleanup after each test - should be called in afterEach
 */
export async function cleanupTestDb(): Promise<void> {
  const testState = TestState.getInstance();

  await cleanupCurrentMode();

  // Release the test client back to the pool
  if (testState.client) {
    testState.client.release();
    testState.reset();
  }
}

/**
 * Close database connections - call in globalTeardown if needed
 */
export async function teardownTestDb(): Promise<void> {
  const globalState = GlobalState.getInstance();
  const testState = TestState.getInstance();

  // Clean up any active test client
  if (testState.client) {
    try {
      await testState.client.query("ROLLBACK");
    } catch (error) {
      // Ignore rollback errors during teardown
    }
    testState.client.release();
    testState.reset();
  }

  await globalState.teardown();
}

/**
 * Reset global state for testing - internal use only
 */
export function _resetGlobalState(): void {
  GlobalState.getInstance().reset();
}
