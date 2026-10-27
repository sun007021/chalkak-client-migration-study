/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Jest VM 안에서는 ESLint의 flat config 동적 import가 막혀(--experimental-vm-modules 필요)
// ESLint CLI를 자식 프로세스로 실행해 샘플 코드를 stdin으로 lint한다.
const root = path.resolve(__dirname, '../../..');
const eslintBin = path.join(root, 'node_modules/eslint/bin/eslint.js');

function lint(code: string, file: string) {
  const run = spawnSync(
    process.execPath,
    [eslintBin, '--stdin', '--stdin-filename', path.join(root, file), '--format', 'json'],
    { cwd: root, input: code, encoding: 'utf8' },
  );
  const [result] = JSON.parse(run.stdout) as { messages: { ruleId: string | null }[] }[];
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
}

describe('시스템 시계 직접 호출 금지 규칙', () => {
  jest.setTimeout(60_000);

  it.each([
    ['new Date()', 'export const a = new Date();'],
    ['Date.now()', 'export const a = Date.now();'],
    ['performance.now()', 'export const a = performance.now();'],
    ['Date.now 참조', 'export const a = Date.now;'],
  ])('TC-TIME-029 일반 소스의 %s는 오류', (_label, code) => {
    expect(lint(code, 'src/features/sample/Sample.ts')).toHaveLength(1);
  });

  it('TC-TIME-029 인자 있는 new Date(x)는 허용', () => {
    expect(lint('export const a = new Date(0);', 'src/features/sample/Sample.ts')).toEqual([]);
  });

  it('TC-TIME-029 Clock.ts와 테스트 코드는 허용', () => {
    const code = 'export const a = new Date(); export const b = Date.now();';
    expect(lint(code, 'src/core/time/Clock.ts')).toEqual([]);
    expect(lint(code, 'src/core/time/sample.test.ts')).toEqual([]);
    expect(lint(code, 'src/core/state/__testing__/helper.ts')).toEqual([]);
  });
});
