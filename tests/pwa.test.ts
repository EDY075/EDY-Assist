import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const publicRoot = new URL('../apps/web/public/', import.meta.url);

describe('PWA instalável e cache seguro', () => {
  it('possui manifest standalone com identidade, atalhos e ícones', async () => {
    const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', publicRoot), 'utf8')) as {
      name: string; short_name: string; display: string; start_url: string; scope: string;
      icons: Array<{ src: string; purpose: string }>;
    };
    expect(manifest).toMatchObject({ name: 'EDY Assist', short_name: 'EDY Assist', display: 'standalone', scope: '/' });
    expect(manifest.start_url).toMatch(/^\//);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    await Promise.all(manifest.icons.map((icon) => readFile(new URL(icon.src.replace(/^\//, ''), publicRoot))));
  });

  it('não intercepta nem armazena rotas da API', async () => {
    const worker = await readFile(new URL('service-worker.js', publicRoot), 'utf8');
    expect(worker).toContain("url.pathname.startsWith('/api/')");
    expect(worker).toContain("request.mode === 'navigate'");
    expect(worker).toContain('if (!response.ok)');
    expect(worker).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(worker).not.toMatch(/cache\.put\([^\n]*api/i);
  });

  it('oferece uma página offline honesta', async () => {
    const offline = await readFile(new URL('offline.html', publicRoot), 'utf8');
    expect(offline).toContain('SQLite do computador');
    expect(offline).toContain('Tentar reconectar');
  });
});
