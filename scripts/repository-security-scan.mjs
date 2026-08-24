import { execFileSync } from 'node:child_process';
import path from 'node:path';

const staged = process.argv.includes('--staged');
const listArgs = staged
  ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']
  : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
const files = execFileSync('git', listArgs, { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];

const forbiddenPaths = [
  ['local-environment', /(^|\/)\.env(?:\.|$)(?!example$)/i],
  ['database', /\.(?:db|sqlite|sqlite3)(?:-(?:journal|shm|wal))?$/i],
  ['runtime-artifact', /(^|\/)\.mobile-runtime\//i],
  ['private-key-or-certificate', /\.(?:pem|key|p12|pfx|jks|keystore)$/i],
  ['downloaded-binary', /(^|\/)tools\/.*\.exe$/i],
];
const contentPatterns = [
  ['private-key-material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['high-risk-token-shape', new RegExp(`(?:github${'_pat_'}|gh[op]_|s${'k-'}[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-)`, 'i')],
  ['temporary-public-url', /https:\/\/[^\s)>"']+\.trycloudflare\.com/i],
  ['absolute-personal-path', /(?:[A-Z]:\\Users\\|[A-Z]:\\EDY-Projects\\)/i],
  ['phone-like-value', /(?:whatsapp:)?\+[1-9][0-9]{7,14}/i],
];

function stagedContent(file) {
  return execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  for (const [category, pattern] of forbiddenPaths) {
    if (pattern.test(normalized)) findings.push({ category, path: normalized });
  }
  if (/\.(?:png|jpg|jpeg|gif|webp|ico|woff2?|zip)$/i.test(normalized)) continue;
  let content;
  try {
    content = staged ? stagedContent(file) : await import('node:fs/promises').then((fs) => fs.readFile(path.resolve(file), 'utf8'));
  } catch {
    continue;
  }
  for (const [category, pattern] of contentPatterns) {
    if (pattern.test(content)) findings.push({ category, path: normalized });
  }
}

const unique = [...new Map(findings.map((item) => [`${item.category}:${item.path}`, item])).values()];
if (unique.length) {
  console.error('Varredura reprovada. Apenas categorias e caminhos são exibidos:');
  for (const item of unique) console.error(`- ${item.category}: ${item.path}`);
  process.exitCode = 1;
} else {
  console.log(`Varredura aprovada: ${files.length} arquivo(s) ${staged ? 'no stage' : 'no inventário Git'}, sem achados de alto risco.`);
}
