#!/usr/bin/env node
// Fetches the dev server OpenAPI document into shared/openapi/chalkak-dev.json.
// Usage: BASE=https://chalkak-dev.pysun.kr node shared/scripts/fetch-openapi.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedRoot } from './lib/fsutil.mjs';

export async function fetchOpenApi({ base = 'https://chalkak-dev.pysun.kr', fetchFn = fetch, outFile = path.join(sharedRoot, 'openapi/chalkak-dev.json') } = {}) {
  const res = await fetchFn(`${base.replace(/\/$/, '')}/v3/api-docs`);
  if (res.status !== 200) throw new Error(`GET /v3/api-docs returned ${res.status}`);
  const doc = await res.json();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(doc, null, 2)}\n`);
  return outFile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`wrote ${await fetchOpenApi({ base: process.env.BASE })}`);
}
