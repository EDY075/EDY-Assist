import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = new PrismaBetterSqlite3(
  { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' },
  { timestampFormat: 'unixepoch-ms' },
);
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, appMode: 'LOCAL', timezone: 'America/Sao_Paulo' },
  });
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
