import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** TC-TIME-029: 시스템 시계를 직접 부르는 곳의 허용 목록. 새 항목을 늘리지 않는다. */
const ALLOWED = new Set(['core/time/SystemClock.ts', 'core/ids.ts']);
const FORBIDDEN = /\bDate\.now\s*\(|\bnew Date\s*\(\s*\)|\bperformance\.now\s*\(|\bsetTimeout\s*\(|\bsetInterval\s*\(|\bqueueMicrotask\b/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('시계 사용 정적 검사', () => {
  it('TC-TIME-029 허용 목록 밖의 소스(테스트 제외)는 시스템 시계·타이머를 직접 부르지 않는다', () => {
    const root = join(__dirname, '..', '..');
    const offenders = sourceFiles(root)
      .map((f) => relative(root, f))
      .filter((rel) => !ALLOWED.has(rel) && !rel.startsWith('test/'))
      .filter((rel) => FORBIDDEN.test(readFileSync(join(root, rel), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
    expect(offenders).toEqual([]);
  });
});
