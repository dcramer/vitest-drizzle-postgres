# vitest-drizzle

An adapter to make Drizzle work with Vitest.

**Currently supports PostgreSQL only.**

## Installation

```bash
npm install vitest-drizzle
```

## Setup

```typescript
// vitest.setup.ts
import { beforeEach, afterEach } from 'vitest';
import { setupTestDb, useTestDb, cleanupTestDb } from 'vitest-drizzle';
import * as schema from './schema';

// Initialize test database
await setupTestDb({
  schema,
  url: 'postgresql://postgres:postgres@localhost:5432/test_db',
  migrationsFolder: './migrations', // optional
});

// Setup hooks for each test
beforeEach(async (ctx) => {
  await useTestDb(ctx); // defaults to savepoint mode
});

afterEach(async () => {
  await cleanupTestDb();
});
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    poolOptions: {
      threads: {
        singleThread: true, // Important for database tests
      },
    },
  },
});
```

## Usage

```typescript
test('user operations', async (ctx) => {
  const db = ctx.$db.client;
  
  const [user] = await db.insert(users).values({
    name: 'John',
    email: 'john@example.com'
  }).returning();
  
  expect(user.name).toBe('John');
  // Data automatically rolled back after test
});

test('with truncate mode', async (ctx) => {
  await ctx.$db.mode('truncate');
  const db = ctx.$db.client;
  
  // Use truncate mode for DDL operations or complex transactions
  // Tables will be truncated after test instead of rollback
});
```

## API

### setupTestDb(options)

Initialize test database. Call once in vitest setup.

```typescript
interface SetupTestDbOptions {
  schema: any;                    // Drizzle schema object
  url: string;                   // PostgreSQL connection URL
  migrationsFolder?: string;     // Path to migration files
}
```

### useTestDb(ctx, mode?)

Setup test context. Call in beforeEach.

```typescript
await useTestDb(ctx, 'savepoint'); // default
await useTestDb(ctx, 'truncate');
```

### cleanupTestDb()

Cleanup after test. Call in afterEach.

### Test Context

```typescript
ctx.$db.client  // Drizzle database client
ctx.$db.mode()  // Switch between 'savepoint' and 'truncate'
```

## Test Modes

**Savepoint (default)**: Uses PostgreSQL savepoints for instant rollbacks. Fastest option.

**Truncate**: Truncates all tables after each test. Use for DDL operations or when savepoints don't work.

## License

Apache-2.0 
