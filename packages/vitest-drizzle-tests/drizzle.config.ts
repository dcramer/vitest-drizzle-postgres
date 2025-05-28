import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.TEST_DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/test_vitest_drizzle",
  },
});
