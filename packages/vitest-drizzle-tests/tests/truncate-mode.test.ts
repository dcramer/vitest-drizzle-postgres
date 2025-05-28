import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { testPosts, testUsers } from "../src/schema";

describe("Truncate Mode", () => {
  test("should switch to truncate mode and isolate data", async (ctx) => {
    // Switch to truncate mode
    await ctx.$db.mode("truncate");
    const db = ctx.$db.client;

    // Insert a user
    const [user] = await db
      .insert(testUsers)
      .values({
        name: "Truncate User",
        email: "truncate@example.com",
        age: 30,
      })
      .returning();

    expect(user.name).toBe("Truncate User");

    // Verify user exists
    const users = await db.select().from(testUsers);
    expect(users).toHaveLength(1);
  });

  test("should not see data from previous truncate test", async (ctx) => {
    // Switch to truncate mode
    await ctx.$db.mode("truncate");
    const db = ctx.$db.client;

    // This test should not see the user from the previous test
    const users = await db.select().from(testUsers);
    expect(users).toHaveLength(0);
  });

  test("should handle mode switching within a test", async (ctx) => {
    const db = ctx.$db.client;

    // Start in savepoint mode (default)
    const [user1] = await db
      .insert(testUsers)
      .values({
        name: "Savepoint User",
        email: "savepoint@example.com",
        age: 25,
      })
      .returning();

    expect(user1.name).toBe("Savepoint User");

    // Verify user1 exists in savepoint mode
    let users = await db.select().from(testUsers);
    expect(users).toHaveLength(1);

    // Switch to truncate mode - this should rollback the savepoint transaction
    await ctx.$db.mode("truncate");

    // After switching to truncate mode, the savepoint data should be gone
    users = await db.select().from(testUsers);
    expect(users).toHaveLength(0);

    // Insert another user in truncate mode
    const [user2] = await db
      .insert(testUsers)
      .values({
        name: "Truncate User",
        email: "truncate@example.com",
        age: 30,
      })
      .returning();

    expect(user2.name).toBe("Truncate User");

    // Only the truncate mode user should exist
    users = await db.select().from(testUsers);
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe("Truncate User");
  });

  test("should handle complex operations in truncate mode", async (ctx) => {
    await ctx.$db.mode("truncate");
    const db = ctx.$db.client;

    // Insert multiple users and posts
    const users = await db
      .insert(testUsers)
      .values([
        { name: "Author 1", email: "author1@example.com", age: 25 },
        { name: "Author 2", email: "author2@example.com", age: 30 },
      ])
      .returning();

    const posts = await db
      .insert(testPosts)
      .values([
        { title: "Post 1", content: "Content 1", authorId: users[0].id },
        { title: "Post 2", content: "Content 2", authorId: users[1].id },
        { title: "Post 3", content: "Content 3", authorId: users[0].id },
      ])
      .returning();

    expect(posts).toHaveLength(3);

    // Test complex query with joins
    const postsWithAuthors = await db
      .select({
        postId: testPosts.id,
        postTitle: testPosts.title,
        authorName: testUsers.name,
        authorAge: testUsers.age,
      })
      .from(testPosts)
      .innerJoin(testUsers, eq(testPosts.authorId, testUsers.id))
      .orderBy(testPosts.id);

    expect(postsWithAuthors).toHaveLength(3);
    expect(postsWithAuthors[0].authorName).toBe("Author 1");
    expect(postsWithAuthors[1].authorName).toBe("Author 2");
    expect(postsWithAuthors[2].authorName).toBe("Author 1");

    // Test updates and deletes
    await db
      .update(testUsers)
      .set({ age: 35 })
      .where(eq(testUsers.id, users[0].id));

    await db.delete(testPosts).where(eq(testPosts.id, posts[2].id));

    // Verify changes
    const updatedUser = await db
      .select()
      .from(testUsers)
      .where(eq(testUsers.id, users[0].id));
    expect(updatedUser[0].age).toBe(35);

    const remainingPosts = await db.select().from(testPosts);
    expect(remainingPosts).toHaveLength(2);
  });
});
