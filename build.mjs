/**
 * Bundles the server into a single executable for distribution.
 * This ensures all dependencies are inlined and no node_modules are needed at runtime.
 */
import * as esbuild from 'esbuild';
import { chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [join(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: join(__dirname, 'build/index.cjs'),
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  sourcemap: false,
  minify: false,
  external: [],
  logLevel: 'info',
});

chmodSync(join(__dirname, 'build/index.cjs'), '755');
console.log('✅ Bundled build written to build/index.cjs');
