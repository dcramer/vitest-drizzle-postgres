import "vitest";
import { TestContext } from "vitest";
import type { TestDbContext } from "vitest-drizzle-postgres";

declare module "vitest" {
  interface TestContext {
    $db: TestDbContext;
  }
}
