import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** Recursively lists files under dir (relative POSIX paths), skipping directories named in `skipDirs`. */
export function walk(dir, { skipDirs = [] } = {}) {
  const out = [];
  const visit = (current, rel) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) visit(path.join(current, entry.name), next);
      } else out.push(next);
    }
  };
  if (fs.existsSync(dir)) visit(dir, '');
  return out.sort();
}

/** Parses markdown pipe-table body rows into arrays of trimmed cells (first/last empty cells dropped). */
export function tableRows(markdown) {
  return markdown
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.slice(1, l.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim()));
}

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const sharedRoot = path.join(repoRoot, 'shared');

export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && ['--root'].includes(a)) { flags[a.slice(2)] = next; i++; }
      else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}
