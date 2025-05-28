import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Define enums to test PostgreSQL enum handling
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive",
  "pending",
  "suspended",
]);
export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "published",
  "archived",
]);

export const testUsers = pgTable("test_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  age: integer("age"),
  status: userStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const testPosts = pgTable("test_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  status: postStatusEnum("status").default("draft").notNull(),
  authorId: integer("author_id").references(() => testUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
});
