import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const testUsers = pgTable("test_users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  age: integer("age"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const testPosts = pgTable("test_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content"),
  authorId: integer("author_id").references(() => testUsers.id),
  createdAt: timestamp("created_at").defaultNow(),
});
