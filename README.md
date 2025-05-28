# vitest-drizzle

An adapter to make Drizzle work with Vitest.

**Currently supports PostgreSQL only.**

## Quick Start

```bash
npm install vitest-drizzle
```

```typescript
// vitest.setup.ts
import { beforeEach, afterEach } from 'vitest';
import { setupTestDb, useTestDb, cleanupTestDb } from 'vitest-drizzle';
import * as schema from './schema';

await setupTestDb({
  schema,
  url: 'postgresql://postgres:postgres@localhost:5432/test_db',
});

beforeEach(async (ctx) => {
  await useTestDb(ctx);
});

afterEach(async () => {
  await cleanupTestDb();
});
```

```typescript
// your.test.ts
test('database operations', async (ctx) => {
  const db = ctx.$db.client;
  
  const [user] = await db.insert(users).values({
    name: 'John',
    email: 'john@example.com'
  }).returning();
  
  expect(user.name).toBe('John');
  // Data automatically cleaned up after test
});
```

## Features

- Automatic schema caching - reuses test database when schema unchanged
- Savepoint mode (default) - instant rollbacks using PostgreSQL savepoints
- Truncate mode - full table cleanup for complex scenarios
- Zero configuration - works with existing Drizzle setup
- Type-safe test context

## Development

This is a pnpm monorepo with Turborepo for build orchestration:

- `packages/vitest-drizzle` - Core library
- `packages/vitest-drizzle-tests` - Test suite

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
