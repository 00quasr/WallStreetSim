import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Connection for queries
const queryClient = postgres(connectionString);

// Drizzle ORM instance
export const db = drizzle(queryClient, { schema });

// Type exports for Drizzle
export type Database = typeof db;
