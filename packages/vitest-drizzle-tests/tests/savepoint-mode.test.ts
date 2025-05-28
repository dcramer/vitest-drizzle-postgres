import { count, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { testPosts, testUsers } from "../src/schema";

describe("Savepoint Mode", () => {
  test("should isolate data between tests", async (ctx) => {
    const db = ctx.$db.client;

    // Insert a user
    const [user] = await db
      .insert(testUsers)
      .values({
        name: "Test User",
        email: "test@example.com",
        age: 25,
      })
      .returning();

    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test@example.com");
    expect(user.age).toBe(25);

    // Verify user exists
    const users = await db.select().from(testUsers);
    expect(users).toHaveLength(1);
  });

  test("should not see data from previous test", async (ctx) => {
    const db = ctx.$db.client;

    // This test should not see the user from the previous test
    const users = await db.select().from(testUsers);
    expect(users).toHaveLength(0);
  });

  test("should handle multiple inserts and rollback", async (ctx) => {
    const db = ctx.$db.client;

    // Insert multiple users
    const users = await db
      .insert(testUsers)
      .values([
        { name: "User 1", email: "user1@example.com", age: 20 },
        { name: "User 2", email: "user2@example.com", age: 30 },
        { name: "User 3", email: "user3@example.com", age: 40 },
      ])
      .returning();

    expect(users).toHaveLength(3);

    // Verify all users exist
    const allUsers = await db.select().from(testUsers);
    expect(allUsers).toHaveLength(3);

    // Insert posts for users
    const posts = await db
      .insert(testPosts)
      .values([
        { title: "Post 1", content: "Content 1", authorId: users[0].id },
        { title: "Post 2", content: "Content 2", authorId: users[1].id },
      ])
      .returning();

    expect(posts).toHaveLength(2);

    // Verify relationships work
    const postsWithAuthors = await db
      .select({
        postTitle: testPosts.title,
        authorName: testUsers.name,
      })
      .from(testPosts)
      .innerJoin(testUsers, eq(testPosts.authorId, testUsers.id));

    expect(postsWithAuthors).toHaveLength(2);
    expect(postsWithAuthors[0].postTitle).toBe("Post 1");
    expect(postsWithAuthors[0].authorName).toBe("User 1");
  });

  test("should handle updates and deletes", async (ctx) => {
    const db = ctx.$db.client;

    // Insert a user
    const [user] = await db
      .insert(testUsers)
      .values({
        name: "Original Name",
        email: "original@example.com",
        age: 25,
      })
      .returning();

    // Update the user
    const [updatedUser] = await db
      .update(testUsers)
      .set({ name: "Updated Name", age: 30 })
      .where(eq(testUsers.id, user.id))
      .returning();

    expect(updatedUser.name).toBe("Updated Name");
    expect(updatedUser.age).toBe(30);
    expect(updatedUser.email).toBe("original@example.com"); // Should remain unchanged

    // Insert another user to delete
    const [userToDelete] = await db
      .insert(testUsers)
      .values({
        name: "To Delete",
        email: "delete@example.com",
        age: 35,
      })
      .returning();

    // Verify we have 2 users
    let allUsers = await db.select().from(testUsers);
    expect(allUsers).toHaveLength(2);

    // Delete the user
    await db.delete(testUsers).where(eq(testUsers.id, userToDelete.id));

    // Verify we have 1 user left
    allUsers = await db.select().from(testUsers);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0].name).toBe("Updated Name");
  });

  test("should handle complex queries", async (ctx) => {
    const db = ctx.$db.client;

    // Insert test data
    const users = await db
      .insert(testUsers)
      .values([
        { name: "Alice", email: "alice@example.com", age: 25 },
        { name: "Bob", email: "bob@example.com", age: 30 },
        { name: "Charlie", email: "charlie@example.com", age: 35 },
      ])
      .returning();

    const posts = await db
      .insert(testPosts)
      .values([
        { title: "Alice Post 1", content: "Content 1", authorId: users[0].id },
        { title: "Alice Post 2", content: "Content 2", authorId: users[0].id },
        { title: "Bob Post 1", content: "Content 3", authorId: users[1].id },
      ])
      .returning();

    // Test aggregation query
    const userPostCounts = await db
      .select({
        userName: testUsers.name,
        postCount: count(testPosts.id),
      })
      .from(testUsers)
      .leftJoin(testPosts, eq(testUsers.id, testPosts.authorId))
      .groupBy(testUsers.id, testUsers.name);

    expect(userPostCounts).toHaveLength(3);

    // Find Alice's post count
    const aliceCount = userPostCounts.find((u) => u.userName === "Alice");
    expect(aliceCount?.postCount).toBe(2);

    // Find Bob's post count
    const bobCount = userPostCounts.find((u) => u.userName === "Bob");
    expect(bobCount?.postCount).toBe(1);

    // Find Charlie's post count (should be 0)
    const charlieCount = userPostCounts.find((u) => u.userName === "Charlie");
    expect(charlieCount?.postCount).toBe(0);
  });
});
