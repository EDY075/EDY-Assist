import 'dotenv/config';
import { initializeDatabase } from '../server/lib/migrate.js';

const result = initializeDatabase(process.env.DATABASE_URL ?? 'file:./prisma/dev.db');
console.log(`SQLite pronto em ${result.databasePath}`);
if (result.applied.length) console.log(`Migrations aplicadas: ${result.applied.join(', ')}`);
