import { initializeDatabase } from '../server/lib/migrate.js';

export default function setup() {
  initializeDatabase(process.env.DATABASE_URL ?? 'file:./prisma/test.db');
}
