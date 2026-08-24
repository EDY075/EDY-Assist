import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function sqlitePathFromUrl(url: string) {
  if (!url.startsWith('file:')) throw new Error('EDY Assist aceita apenas DATABASE_URL SQLite iniciada por file:.');
  const rawPath = decodeURIComponent(url.slice('file:'.length));
  if (!rawPath) throw new Error('DATABASE_URL não contém o caminho do banco SQLite.');
  return path.resolve(rawPath.replace(/^\.\//, ''));
}

function hasTable(db: Database.Database, table: string) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function hasColumn(db: Database.Database, table: string, column: string) {
  if (!hasTable(db, table)) return false;
  return (db.prepare(`PRAGMA table_info(\"${table}\")`).all() as Array<{ name: string }>).some((item) => item.name === column);
}

function migrationAlreadyReflected(db: Database.Database, name: string) {
  if (name === '0001_init') return hasTable(db, 'AppSettings') && hasTable(db, 'Reminder') && hasTable(db, 'StudyLog');
  if (name === '0002_water_reminder_setting') return hasColumn(db, 'AppSettings', 'waterReminderEnabled');
  if (name === '0003_study_modules') return hasTable(db, 'StudyModule');
  if (name === '0004_study_details') return hasColumn(db, 'StudyLog', 'activityType') && hasColumn(db, 'StudyModule', 'goalMinutes');
  if (name === '0005_study_module_archive') return hasColumn(db, 'StudyModule', 'isArchived') && hasColumn(db, 'StudyModule', 'archivedAt');
  return false;
}

export function initializeDatabase(databaseUrl: string, migrationsRoot = path.resolve('prisma/migrations')) {
  const databasePath = sqlitePathFromUrl(databaseUrl);
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS "_EdyFocusMigration" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(migrationsRoot, entry.name, 'migration.sql')))
      .map((entry) => entry.name)
      .sort();
    const applied: string[] = [];
    for (const name of migrations) {
      const sql = readFileSync(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = db.prepare('SELECT checksum FROM "_EdyFocusMigration" WHERE name = ?').get(name) as { checksum: string } | undefined;
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`A migration já aplicada ${name} foi alterada.`);
        continue;
      }
      db.transaction(() => {
        if (!migrationAlreadyReflected(db, name)) db.exec(sql);
        db.prepare('INSERT INTO "_EdyFocusMigration" (name, checksum) VALUES (?, ?)').run(name, checksum);
      })();
      applied.push(name);
    }
    return { databasePath, applied };
  } finally {
    db.close();
  }
}
