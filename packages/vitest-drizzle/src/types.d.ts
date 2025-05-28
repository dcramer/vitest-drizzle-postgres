// drizzle-vitest.d.ts
import { TestContext } from "vitest";
import type { TestDbContext } from "./index";

declare module "vitest" {
  interface TestContext {
    $db: TestDbContext;
  }
}
