// Bundles the server (including the workspace `@dostotinka/shared` package) into dist/index.js.
// Runtime dependencies from package.json stay external and are installed in the image.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/index.ts', 'src/db/migrate-cli.ts', 'src/demo/reset-cli.ts'],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}),
  banner: {
    js: "import { createRequire as __dsCreateRequire } from 'node:module'; const require = __dsCreateRequire(import.meta.url);",
  },
  logLevel: 'info',
});
