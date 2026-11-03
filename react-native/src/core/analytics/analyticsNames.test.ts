import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { fixtureBody } from '../http/__testing__/loadFixture';
import { ANALYTICS_SCREEN_NAMES, ANALYTICS_TAB_DESTINATIONS } from '../../shared/constants';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__testing__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const sources = sourceFiles(SRC).map((path) => readFileSync(path, 'utf8'));
const literals = (pattern: RegExp) =>
  sources.flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1]));

describe('분석 이름 (shared/constants.json 대조)', () => {
  it('TC-ANL-002 screen_name 허용 목록은 19종이고 fixture 순서·철자까지 같다', () => {
    const expected = fixtureBody<{ cases: string[] }>('anl/events__expected-screen-names').cases;
    expect(ANALYTICS_SCREEN_NAMES).toHaveLength(19);
    expect([...ANALYTICS_SCREEN_NAMES]).toEqual(expected);
  });

  it('TC-ANL-023 소스가 보내는 screen_view 이름은 모두 허용 목록 안에 있다', () => {
    const sent = literals(/screenView\(\s*'([^']+)'/g);
    expect(sent.length).toBeGreaterThan(0);
    const unknown = sent.filter((name) => !ANALYTICS_SCREEN_NAMES.includes(name));
    expect(unknown).toEqual([]);
  });

  it('TC-ANL-023 TC-SET-052 TC-FDBK-001 설정과 피드백 화면의 screen_view 전송이 소스에 있다', () => {
    const sent = new Set(literals(/screenView\(\s*'([^']+)'/g));
    expect(sent.has('settings')).toBe(true);
    expect(sent.has('feedback')).toBe(true);
  });

  it('TC-ANL-007 TC-ANL-023 logEvent로 보내는 이벤트는 screen_view와 bottom_navigation_selected뿐이다', () => {
    const events = literals(/logEvent\(\s*'([^']+)'/g);
    const allowed = ['screen_view', 'bottom_navigation_selected'];
    expect(events.filter((name) => !allowed.includes(name))).toEqual([]);
  });

  it('TC-ANL-023 탭 destination 값은 홈, 전시, 기록, 설정 4종이다', () => {
    expect([...ANALYTICS_TAB_DESTINATIONS]).toEqual(['home', 'display', 'record', 'settings']);
  });
});
