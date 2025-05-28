# vitest-drizzle-postgres

Vitest + Drizzle.

## Quick Start

```bash
npm install vitest-drizzle-postgres
```

```typescript
// vitest.setup.ts
/// <reference types="vitest-drizzle-postgres/types" />

import { setupTestDb, useTestDb, cleanupTestDb } from 'vitest-drizzle-postgres';
import { beforeAll, beforeEach, afterEach } from 'vitest';

import { db } from './src/db'; // Your existing database connection
import * as schema from './src/schema';

beforeAll(async () => {
  await setupTestDb({
    schema,
    db,
    migrationsFolder: "./migrations", // optional
  });
});


beforeEach(async (ctx) => {
  await useTestDb(ctx);
});

afterEach(async () => {
  await cleanupTestDb();
});
```

```typescript
// user.test.ts
import { describe, test, expect } from 'vitest';
import { users } from './schema';

import { db } from './src/db'; // Your existing database connection

describe('User tests', () => {
  test('should create and find user', async () => {
    const [user] = await db
      .insert(users)
      .values({ name: 'John', email: 'john@example.com' })
      .returning();

    expect(user.name).toBe('John');
    
    const foundUsers = await db.select().from(users);
    expect(foundUsers).toHaveLength(1);
  });

  test('should not see data from previous test', async () => {
    const users = await db.select().from(users);
    expect(users).toHaveLength(0); // Clean slate
  });
});
```

## Features

- Uses PostgreSQL savepoints for fast test isolation
- Schema change detection and caching
- Works with your existing Drizzle database connection
- Supports both savepoint and truncate modes
- Minimal setup required

## Packages

- `packages/vitest-drizzle-postgres` - Core library
- `packages/vitest-drizzle-postgres-tests` - Test suite

## Development

This is a pnpm monorepo with Turborepo for build orchestration:

- `packages/vitest-drizzle-postgres` - Core library
- `packages/vitest-drizzle-postgres-tests` - Test suite

```bash
pnpm install
pnpm build
pnpm test
```

## Publishing

This project uses [Changesets](https://github.com/changesets/changesets) for version management and publishing. See [PUBLISHING.md](./PUBLISHING.md) for detailed instructions.

Quick workflow:

```bash
pnpm changeset              # Create a changeset
pnpm changeset:version      # Update versions
pnpm changeset:publish      # Publish to npm
```

See individual package READMEs for detailed documentation. 
