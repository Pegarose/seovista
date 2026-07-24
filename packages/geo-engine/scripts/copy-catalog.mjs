// Copies the replaceable Crew catalog fixture alongside the compiled JS so
// `loadCrewCatalog()` can read it from `dist/catalog/crew-services.json` at
// runtime (tsc with `resolveJsonModule` does not copy `.json` files to
// outDir). Idempotent; safe to re-run.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'src', 'catalog', 'crew-services.json');
const destDir = resolve(root, 'dist', 'catalog');
const dest = resolve(destDir, 'crew-services.json');

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
