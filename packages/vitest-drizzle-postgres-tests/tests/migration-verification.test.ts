import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanupTestDb, useTestDb } from "vitest-drizzle-postgres";
import * as schema from "../src/schema";

describe("Migration Verification", () => {
  beforeEach(async (ctx: ExtendedTestContext) => {
    await useTestDb(ctx);
  });

  afterEach(async () => {
    await cleanupTestDb();
  });

  test("should create migration tracking table", async (ctx: ExtendedTestContext) => {
    const testDb = ctx.$db.client;

    // Check that the __drizzle_migrations table exists in the drizzle schema
    const result = await testDb.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'drizzle' 
        AND table_name = '__drizzle_migrations'
      ) as exists
    `);

    expect(result.rows[0]?.exists).toBe(true);
  });

  test("should have migration entries in tracking table", async (ctx: ExtendedTestContext) => {
    const testDb = ctx.$db.client;

    // Check that migrations were recorded in the drizzle schema
    const result = await testDb.execute(sql`
      SELECT id, hash, created_at 
      FROM drizzle.__drizzle_migrations 
      ORDER BY created_at
    `);

    expect(result.rows.length).toBeGreaterThan(0);

    // Should have at least one migration (0000_fearless_magus.sql)
    const firstMigration = result.rows[0] as any;
    expect(firstMigration.id).toBeDefined();
    expect(firstMigration.hash).toBeDefined();
    expect(firstMigration.created_at).toBeDefined();
  });

  test("should create test_users table with correct structure", async (ctx: ExtendedTestContext) => {
    const testDb = ctx.$db.client;

    // Check that test_users table exists
    const tableExists = await testDb.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'test_users'
      ) as exists
    `);

    expect(tableExists.rows[0]?.exists).toBe(true);

    // Check table structure
    const columns = await testDb.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'test_users'
      ORDER BY ordinal_position
    `);

    const columnMap = new Map(
      columns.rows.map((row: any) => [row.column_name, row])
    );

    // Verify expected columns exist
    expect(columnMap.has("id")).toBe(true);
    expect(columnMap.has("name")).toBe(true);
    expect(columnMap.has("email")).toBe(true);
    expect(columnMap.has("age")).toBe(true);
    expect(columnMap.has("created_at")).toBe(true);

    // Verify column types
    expect(columnMap.get("id")?.data_type).toBe("integer");
    expect(columnMap.get("name")?.data_type).toBe("text");
    expect(columnMap.get("email")?.data_type).toBe("text");
    expect(columnMap.get("age")?.data_type).toBe("integer");
    expect(columnMap.get("created_at")?.data_type).toBe(
      "timestamp without time zone"
    );

    // Verify nullable constraints
    expect(columnMap.get("id")?.is_nullable).toBe("NO");
    expect(columnMap.get("name")?.is_nullable).toBe("NO");
    expect(columnMap.get("email")?.is_nullable).toBe("NO");
    expect(columnMap.get("age")?.is_nullable).toBe("YES");
    expect(columnMap.get("created_at")?.is_nullable).toBe("YES");
  });

  test("should create test_posts table with correct structure", async (ctx) => {
    const testDb = ctx.$db.client;

    // Check that test_posts table exists
    const tableExists = await testDb.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'test_posts'
      ) as exists
    `);

    expect(tableExists.rows[0]?.exists).toBe(true);

    // Check table structure
    const columns = await testDb.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'test_posts'
      ORDER BY ordinal_position
    `);

    const columnMap = new Map(
      columns.rows.map((row: any) => [row.column_name, row])
    );

    // Verify expected columns exist
    expect(columnMap.has("id")).toBe(true);
    expect(columnMap.has("title")).toBe(true);
    expect(columnMap.has("content")).toBe(true);
    expect(columnMap.has("author_id")).toBe(true);
    expect(columnMap.has("created_at")).toBe(true);

    // Verify column types
    expect(columnMap.get("id")?.data_type).toBe("integer");
    expect(columnMap.get("title")?.data_type).toBe("text");
    expect(columnMap.get("content")?.data_type).toBe("text");
    expect(columnMap.get("author_id")?.data_type).toBe("integer");
    expect(columnMap.get("created_at")?.data_type).toBe(
      "timestamp without time zone"
    );
  });

  test("should create foreign key constraint", async (ctx) => {
    const testDb = ctx.$db.client;

    // Check that the foreign key constraint exists
    const constraints = await testDb.execute(sql`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'test_posts'
    `);

    expect(constraints.rows.length).toBe(1);

    const fkConstraint = constraints.rows[0] as any;
    expect(fkConstraint.table_name).toBe("test_posts");
    expect(fkConstraint.column_name).toBe("author_id");
    expect(fkConstraint.foreign_table_name).toBe("test_users");
    expect(fkConstraint.foreign_column_name).toBe("id");
  });

  test("should create unique constraint on email", async (ctx) => {
    const testDb = ctx.$db.client;

    // Check that the unique constraint exists
    const constraints = await testDb.execute(sql`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'test_users'
        AND kcu.column_name = 'email'
    `);

    expect(constraints.rows.length).toBe(1);

    const uniqueConstraint = constraints.rows[0] as any;
    expect(uniqueConstraint.constraint_name).toBe("test_users_email_unique");
    expect(uniqueConstraint.table_name).toBe("test_users");
    expect(uniqueConstraint.column_name).toBe("email");
  });

  test("should be able to insert and query data", async (ctx) => {
    const testDb = ctx.$db.client;

    // Test that the tables are functional by inserting and querying data
    const { testUsers, testPosts } = schema;

    // Insert a test user
    const [user] = await testDb
      .insert(testUsers)
      .values({
        name: "Migration Test User",
        email: "migration-test@example.com",
        age: 30,
      })
      .returning();

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Migration Test User");
    expect(user.email).toBe("migration-test@example.com");

    // Insert a test post
    const [post] = await testDb
      .insert(testPosts)
      .values({
        title: "Migration Test Post",
        content: "This post tests that migrations created working tables",
        authorId: user.id,
      })
      .returning();

    expect(post.id).toBeDefined();
    expect(post.title).toBe("Migration Test Post");
    expect(post.authorId).toBe(user.id);

    // Query with join to test foreign key relationship
    const postsWithAuthors = await testDb
      .select({
        postTitle: testPosts.title,
        authorName: testUsers.name,
      })
      .from(testPosts)
      .innerJoin(testUsers, sql`${testPosts.authorId} = ${testUsers.id}`)
      .where(sql`${testPosts.id} = ${post.id}`);

    expect(postsWithAuthors).toHaveLength(1);
    expect(postsWithAuthors[0]?.postTitle).toBe("Migration Test Post");
    expect(postsWithAuthors[0]?.authorName).toBe("Migration Test User");
  });

  test("should enforce unique constraint", async (ctx) => {
    const testDb = ctx.$db.client;
    const { testUsers } = schema;

    // Insert first user
    await testDb.insert(testUsers).values({
      name: "User 1",
      email: "unique-test@example.com",
      age: 25,
    });

    // Try to insert second user with same email - should fail
    await expect(
      testDb.insert(testUsers).values({
        name: "User 2",
        email: "unique-test@example.com", // Same email
        age: 30,
      })
    ).rejects.toThrow(/duplicate key value violates unique constraint/);
  });
});
