-- Initialize the test database for vitest-drizzle
-- This script runs when the PostgreSQL container starts for the first time

-- Create the test database
CREATE DATABASE test_vitest_drizzle;

-- Grant all privileges to the postgres user
GRANT ALL PRIVILEGES ON DATABASE test_vitest_drizzle TO postgres;

-- Connect to the test database
\c test_vitest_drizzle;

-- Enable any extensions that might be useful for testing
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Note: The actual table schema will be created by drizzle-kit migrations
-- This ensures the schema matches the Drizzle schema definitions exactly

\echo 'Test database initialized successfully!'; 
 