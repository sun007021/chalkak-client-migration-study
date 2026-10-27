import { ROUTES, screenNameForPath } from '../../app/routes';
import { ANALYTICS_TAB_DESTINATIONS } from '../../constants';
import { MAIN_TABS, planTabNavigation, tabForPath, tabPath } from './tabs';

describe('탭 경로', () => {
  it('REQ-NAV-001 탭은 홈, 전시, 기록, 설정 순서로 4개이고 분석 destination과 같다', () => {
    expect([...MAIN_TABS]).toEqual(['home', 'display', 'record', 'settings']);
    expect([...MAIN_TABS]).toEqual([...ANALYTICS_TAB_DESTINATIONS]);
  });

  it('TC-NAV-044 탭마다 URL 경로가 있다: /home, /display, /record, /settings', () => {
    expect(MAIN_TABS.map(tabPath)).toEqual(['/home', '/display', '/record', '/settings']);
    expect(ROUTES.display).toBe('/display');
    expect(ROUTES.record).toBe('/record');
    expect(ROUTES.settings).toBe('/settings');
  });

  it('TC-NAV-044 경로에서 탭을 되찾는다(새로고침 복원). 탭 루트가 아니면 null이다', () => {
    expect(MAIN_TABS.map((tab) => tabForPath(tabPath(tab)))).toEqual([...MAIN_TABS]);
    for (const pathname of ['/', '/login', '/signup/terms', '/feed/abc', '/display/extra', '/Home', '']) {
      expect(tabForPath(pathname), pathname).toBeNull();
    }
  });

  it('TC-ANL-005 탭 경로의 screen_view 이름은 home, display, record, settings이다', () => {
    expect(MAIN_TABS.map((tab) => screenNameForPath(tabPath(tab)))).toEqual(['home', 'display', 'record', 'settings']);
  });
});

describe('탭 전환 히스토리 정책 (push vs replace)', () => {
  it('REQ-NAV-006 같은 탭을 다시 선택하면 아무것도 쌓지 않는다', () => {
    for (const tab of MAIN_TABS) expect(planTabNavigation(tab, tab, null)).toEqual({ kind: 'none' });
  });

  it('TC-NAV-044 홈에서 다른 탭으로 가면 push하고 홈이 아래에 있다고 기록한다', () => {
    expect(planTabNavigation('home', 'display', null)).toEqual({ kind: 'push', to: '/display', state: { homeBelow: true } });
    expect(planTabNavigation('home', 'record', null)).toEqual({ kind: 'push', to: '/record', state: { homeBelow: true } });
    expect(planTabNavigation('home', 'settings', { homeBelow: false })).toEqual({ kind: 'push', to: '/settings', state: { homeBelow: true } });
  });

  it('TC-NAV-044 비홈 탭끼리는 replace하고 홈이 아래에 있는지는 그대로 이어받는다(뒤로 가면 홈)', () => {
    expect(planTabNavigation('display', 'settings', { homeBelow: true })).toEqual({ kind: 'replace', to: '/settings', state: { homeBelow: true } });
    expect(planTabNavigation('record', 'display', { homeBelow: false })).toEqual({ kind: 'replace', to: '/display', state: { homeBelow: false } });
    expect(planTabNavigation('record', 'display', null)).toEqual({ kind: 'replace', to: '/display', state: { homeBelow: false } });
  });

  it('TC-NAV-044 REQ-NAV-026 비홈 탭에서 홈을 고르면 홈이 바로 아래에 있을 때 뒤로 가고, 아니면 replace한다(홈이 두 번 쌓이지 않는다)', () => {
    expect(planTabNavigation('settings', 'home', { homeBelow: true })).toEqual({ kind: 'back' });
    expect(planTabNavigation('settings', 'home', { homeBelow: false })).toEqual({ kind: 'replace', to: '/home', state: { homeBelow: false } });
    expect(planTabNavigation('record', 'home', null)).toEqual({ kind: 'replace', to: '/home', state: { homeBelow: false } });
  });
});
