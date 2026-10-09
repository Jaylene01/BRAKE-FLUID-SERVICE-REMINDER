import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const html = readFileSync(join(root, 'public/index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');

assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
assert.match(html, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
assert.ok(manifest.icons.some(icon => icon.src === '/icons/icon-192.png' && icon.type === 'image/png'));
assert.ok(manifest.icons.some(icon => icon.src === '/icons/icon-512.png' && icon.type === 'image/png' && icon.purpose.includes('maskable')));

assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
assert.match(sw, /event\.respondWith\(fetch\(request\)\)/);
assert.match(sw, /request\.mode === 'navigate'/);
assert.doesNotMatch(sw, /caches\.match\(event\.request\)\.then\(r => r \|\| caches\.match\('\/'\)\)/);

console.log('PWA checks passed');
