import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: '../../migrations/drizzle',
  dbCredentials: { url: process.env.JA_DATABASE_PATH ?? '../../data/app.db' },
  strict: true,
  verbose: true,
});
