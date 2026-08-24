import path from 'node:path';
import QRCode from 'qrcode';

const [url, outputPath] = process.argv.slice(2);
if (!url || !outputPath) {
  console.error('Uso: node scripts/print-mobile-qr.mjs URL ARQUIVO.svg');
  process.exit(1);
}

const parsed = new URL(url);
if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.trycloudflare.com')) {
  console.error('A URL do QR Code precisa ser um Quick Tunnel HTTPS do Cloudflare.');
  process.exit(1);
}

await QRCode.toFile(path.resolve(outputPath), url, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#08090d', light: '#ffffff' },
});

console.log(await QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'M' }));
