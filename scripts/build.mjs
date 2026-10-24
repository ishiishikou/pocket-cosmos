import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({ entryPoints: ['src/main.js'], outfile: 'dist/app.js', bundle: true, minify: true, format: 'esm', target: ['safari16'], sourcemap: false, legalComments: 'eof' });
