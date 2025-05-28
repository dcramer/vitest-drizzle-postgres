/// <reference types="vitest-drizzle-postgres/types" />

import type { TestContext } from "vitest";
import { testPosts, testUsers } from "./schema";

export interface TestUser {
  name: string;
  email: string;
  age?: number;
}

export interface TestPost {
  title: string;
  content?: string;
  authorId: number;
}

/**
 * Test helper utilities to reduce code duplication
 */
export class TestHelpers {
  /**
   * Create a test user with default values
   */
  static createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    return {
      name: "Test User",
      email: "test@example.com",
      age: 25,
      ...overrides,
    };
  }

  /**
   * Create multiple test users
   */
  static createTestUsers(count: number, namePrefix = "User"): TestUser[] {
    return Array.from({ length: count }, (_, i) => ({
      name: `${namePrefix} ${i + 1}`,
      email: `${namePrefix.toLowerCase()}${i + 1}@example.com`,
      age: 20 + i * 5,
    }));
  }

  /**
   * Create a test post with default values
   */
  static createTestPost(
    authorId: number,
    overrides: Partial<Omit<TestPost, "authorId">> = {}
  ): TestPost {
    return {
      title: "Test Post",
      content: "Test content",
      authorId,
      ...overrides,
    };
  }

  /**
   * Insert a single user and return the result
   */
  static async insertUser(ctx: TestContext, userData: TestUser) {
    const db = ctx.$db.client;
    const [user] = await db.insert(testUsers).values(userData).returning();
    return user;
  }

  /**
   * Insert multiple users and return the results
   */
  static async insertUsers(ctx: TestContext, usersData: TestUser[]) {
    const db = ctx.$db.client;
    const users = await db.insert(testUsers).values(usersData).returning();
    return users;
  }

  /**
   * Insert a single post and return the result
   */
  static async insertPost(ctx: TestContext, postData: TestPost) {
    const db = ctx.$db.client;
    const [post] = await db.insert(testPosts).values(postData).returning();
    return post;
  }

  /**
   * Insert multiple posts and return the results
   */
  static async insertPosts(ctx: TestContext, postsData: TestPost[]) {
    const db = ctx.$db.client;
    const posts = await db.insert(testPosts).values(postsData).returning();
    return posts;
  }

  /**
   * Get all users from the database
   */
  static async getAllUsers(ctx: TestContext) {
    const db = ctx.$db.client;
    return await db.select().from(testUsers);
  }

  /**
   * Get all posts from the database
   */
  static async getAllPosts(ctx: TestContext) {
    const db = ctx.$db.client;
    return await db.select().from(testPosts);
  }

  /**
   * Count users in the database
   */
  static async countUsers(ctx: TestContext): Promise<number> {
    const users = await TestHelpers.getAllUsers(ctx);
    return users.length;
  }

  /**
   * Count posts in the database
   */
  static async countPosts(ctx: TestContext): Promise<number> {
    const posts = await TestHelpers.getAllPosts(ctx);
    return posts.length;
  }

  /**
   * Create a complete test scenario with users and posts
   */
  static async createTestScenario(ctx: TestContext) {
    const users = await TestHelpers.insertUsers(ctx, [
      TestHelpers.createTestUser({
        name: "Alice",
        email: "alice@example.com",
        age: 25,
      }),
      TestHelpers.createTestUser({
        name: "Bob",
        email: "bob@example.com",
        age: 30,
      }),
      TestHelpers.createTestUser({
        name: "Charlie",
        email: "charlie@example.com",
        age: 35,
      }),
    ]);

    const posts = await TestHelpers.insertPosts(ctx, [
      TestHelpers.createTestPost(users[0].id, {
        title: "Alice Post 1",
        content: "Content 1",
      }),
      TestHelpers.createTestPost(users[0].id, {
        title: "Alice Post 2",
        content: "Content 2",
      }),
      TestHelpers.createTestPost(users[1].id, {
        title: "Bob Post 1",
        content: "Content 3",
      }),
    ]);

    return { users, posts };
  }

  /**
   * Assert that the database is empty
   */
  static async assertDatabaseEmpty(ctx: TestContext) {
    const userCount = await TestHelpers.countUsers(ctx);
    const postCount = await TestHelpers.countPosts(ctx);

    if (userCount !== 0 || postCount !== 0) {
      throw new Error(
        `Expected empty database, but found ${userCount} users and ${postCount} posts`
      );
    }
  }

  /**
   * Switch test mode and verify it works
   */
  static async switchModeAndVerify(
    ctx: TestContext,
    mode: "savepoint" | "truncate"
  ) {
    await ctx.$db.mode(mode);

    // Insert a test user to verify the mode switch worked
    const testUser = TestHelpers.createTestUser({ name: `${mode} test user` });
    const user = await TestHelpers.insertUser(ctx, testUser);

    return user;
  }
}
