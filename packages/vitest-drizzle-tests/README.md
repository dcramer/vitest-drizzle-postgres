# vitest-drizzle-tests

Test suite for the vitest-drizzle package.

## Running Tests

```bash
# Start PostgreSQL
pnpm db:start

# Run tests
pnpm test

# Run in watch mode
pnpm test:watch

# Stop database
pnpm db:stop
```

## Test Structure

- `*.test.ts` - Test files covering different modes and scenarios
- `schema.ts` - Test database schema
- `vitest.setup.ts` - Global test setup
- `test-helpers.ts` - Utility functions
- `migrations/` - Database migrations
- `docker-compose.yml` - PostgreSQL setup

## Test Coverage

- Savepoint mode isolation
- Truncate mode cleanup
- Schema change detection
- Error handling
- Mode switching

## Example Test

```typescript
test('data isolation', async (ctx) => {
  const db = ctx.$db.client;

  const [user] = await db.insert(testUsers).values({
    name: 'Test User',
    email: 'test@example.com',
    age: 25,
  }).returning();

  expect(user.name).toBe('Test User');
  // Data automatically cleaned up
});
```

## Database Management

```bash
pnpm db:generate  # Generate migrations
pnpm db:migrate   # Apply migrations
pnpm db:studio    # Open Drizzle Studio
pnpm db:reset     # Reset database
```
