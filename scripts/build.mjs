import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const pages = process.argv.includes('--pages');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({ entryPoints: ['src/main.js'], outfile: 'dist/app.js', bundle: true, minify: true, format: 'esm', target: ['safari16'], sourcemap: false, legalComments: 'eof' });
await build({ entryPoints: ['src/main-p2p.js'], outfile: 'dist/p2p.js', bundle: true, minify: true, format: 'esm', target: ['safari16'], sourcemap: false, legalComments: 'eof' });
// Both deployments retain the original experience; Pages runs only the P2P entry.
const original = await readFile('dist/index.html', 'utf8');
const p2p = original
  .replace('<script type="module" src="app.js"></script>',
    '<link rel="stylesheet" href="p2p.css"><link rel="manifest" href="manifest.webmanifest"><script type="module" src="p2p.js"></script>')
  .replace('登録不要・8台まで。招待先は親が確認。', '登録不要・2台の直接通信。');
await writeFile('dist/p2p.html', p2p);
if (pages) {
  await writeFile('dist/index.html', p2p.replace('src="p2p.js"', 'src="app.js"'));
  await cp('dist/p2p.js', 'dist/app.js');
  // A Pages PWA must cache only public assets. No session or names leave the device.
}
