# vitest-drizzle-postgres

An adapter to make Drizzle work with Vitest.

**Currently supports PostgreSQL only.**

## Installation

```bash
npm install vitest-drizzle-postgres
```

## Setup

```typescript
// vitest.setup.ts
/// <reference types="vitest-drizzle-postgres/types" />

import { setupTestDb, useTestDb, cleanupTestDb } from 'vitest-drizzle-postgres';
import { beforeEach, afterEach } from 'vitest';
import { db } from './src/db'; // Your existing database connection
import * as schema from './src/schema';

await setupTestDb({
  schema,
  db,
  migrationsFolder: './migrations', // optional
});

beforeEach(async (ctx) => {
  await useTestDb(ctx);
});

afterEach(async () => {
  await cleanupTestDb();
});
```

## Usage

```typescript
// user.test.ts
import { describe, test, expect } from 'vitest';
import { users } from './schema';

describe('User tests', () => {
  test('should create and find user', async (ctx) => {
    const db = ctx.$db.client;

    const [user] = await db
      .insert(users)
      .values({ name: 'John', email: 'john@example.com' })
      .returning();

    expect(user.name).toBe('John');
    
    const foundUsers = await db.select().from(users);
    expect(foundUsers).toHaveLength(1);
  });

  test('should not see data from previous test', async (ctx) => {
    const db = ctx.$db.client;
    
    const users = await db.select().from(users);
    expect(users).toHaveLength(0); // Clean slate
  });
});
```

## Test Modes

```typescript
// Savepoint mode (default) - fastest
beforeEach(async (ctx) => {
  await useTestDb(ctx, 'savepoint');
});

// Truncate mode - for DDL operations
beforeEach(async (ctx) => {
  await useTestDb(ctx, 'truncate');
});

// Switch modes within test
test('mixed mode test', async (ctx) => {
  await ctx.$db.mode('truncate');
});
```

## API

### setupTestDb(options)

- `schema` (required): Drizzle schema object
- `db` (required): Existing Drizzle database instance
- `migrationsFolder` (optional): Path to SQL migration files

### useTestDb(ctx, mode?)

- `ctx`: Vitest test context
- `mode`: `'savepoint'` (default) or `'truncate'`

### cleanupTestDb()

Call in `afterEach` to clean up after each test. 
