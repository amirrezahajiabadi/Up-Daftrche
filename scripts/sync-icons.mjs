import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const REFERENCES = ['index.html', 'manifest.webmanifest'];

export function iconURL(path, bytes = readFileSync(new URL(path, ROOT))) {
  const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return `${path}?asset=${fingerprint}`;
}

export function syncIconReferences(content) {
  return content.replace(/assets\/icons\/[\w.-]+(?:\?asset=[a-f\d]+)?/g, reference => {
    return iconURL(reference.split('?')[0]);
  });
}

/* The rasters are not drawn here: every icon is generated edge to edge from the
   single master (assets/icons/master-logo.jpg) by scripts/generate-icons.py —
   a full-bleed green felt square with the face and pocket inside the central
   safe zone, plus the transparent squircle master. There is no cream padding
   box and no background: the felt runs to every edge. This module regenerates
   those files and then fingerprints the resulting URLs. */
export function generateIcons({ quiet = false } = {}) {
  const script = fileURLToPath(new URL('generate-icons.py', import.meta.url));
  if (!existsSync(script)) throw new Error(`Missing generator: ${script}`);
  const interpreters = [process.env.PYTHON, 'python3', 'python'].filter(Boolean);
  for (const python of interpreters) {
    const result = spawnSync(python, [script], {
      stdio: quiet ? 'pipe' : 'inherit',
      encoding: 'utf8',
    });
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${python} scripts/generate-icons.py failed (${result.status})\n${result.stderr || ''}`);
    }
    return python;
  }
  throw new Error('No Python interpreter found; install Python 3 with Pillow to regenerate icons');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const check = process.argv.includes('--check');
  if (!check) {
    try {
      generateIcons();
    } catch (error) {
      console.error(error.message || String(error));
      process.exitCode = 1;
    }
  }
  let stale = false;
  for (const path of REFERENCES) {
    const target = new URL(path, ROOT);
    const content = readFileSync(target, 'utf8');
    const updated = syncIconReferences(content);
    if (content === updated) continue;
    stale = true;
    if (check) {
      console.error(`Stale icon URLs in ${path}; run node scripts/sync-icons.mjs`);
    } else {
      writeFileSync(target, updated, 'utf8');
      console.log(`Updated icon URLs in ${path}`);
    }
  }
  if (stale && check) process.exitCode = 1;
}
