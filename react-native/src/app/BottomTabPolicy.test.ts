import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeToastPresenter } from '../core/toast/__testing__/FakeToastPresenter';
import type { MainMode } from '../features/auth/AuthFlowNavigator';
import { t } from '../shared/copy';
import { BottomTabPolicy } from './BottomTabPolicy';
import type { TabRouteName } from './navigation/routes';

function setup(mode: MainMode) {
  const analytics = new FakeAnalyticsTracker();
  const toast = new FakeToastPresenter();
  return { analytics, toast, policy: new BottomTabPolicy({ mode, analytics, toast }) };
}

describe('BottomTabPolicy 탭 누름', () => {
  it.each([
    ['Home', 'home'],
    ['Display', 'display'],
    ['Record', 'record'],
    ['Settings', 'settings'],
  ] as const)(
    'REQ-NAV-009 회원이 %s를 누르면 destination=%s를 보내고 이동을 허용한다',
    (name, destination) => {
      const h = setup('member');
      expect(h.policy.onTabPress(name as TabRouteName)).toBe('proceed');
      expect(h.analytics.events).toEqual([
        { name: 'bottom_navigation_selected', params: { destination } },
      ]);
      expect(h.toast.messages).toEqual([]);
    },
  );

  it('REQ-NAV-009 같은 탭을 다시 눌러도 매번 분석 이벤트를 보낸다', () => {
    const h = setup('member');
    h.policy.onTabPress('Display');
    h.policy.onTabPress('Display');
    expect(h.analytics.events).toHaveLength(2);
  });

  it('D-05 게스트가 기록 탭을 누르면 토스트 nav.guest.record만 보이고 막힌다(분석 없음)', () => {
    const h = setup('guest');
    expect(h.policy.onTabPress('Record')).toBe('blocked');
    expect(h.toast.messages).toEqual([t('nav.guest.record')]);
    expect(h.analytics.events).toEqual([]);
  });

  it.each(['Home', 'Display', 'Settings'] as const)(
    'D-05 게스트도 %s 탭은 막히지 않고 분석을 보낸다',
    (name) => {
      const h = setup('guest');
      expect(h.policy.onTabPress(name)).toBe('proceed');
      expect(h.analytics.events).toHaveLength(1);
      expect(h.toast.messages).toEqual([]);
    },
  );
});

describe('BottomTabPolicy 업로드 버튼', () => {
  it('D-05 게스트는 토스트 nav.guest.upload만 보이고 업로드로 가지 않는다', () => {
    const h = setup('guest');
    expect(h.policy.onUploadPress()).toBe('blocked');
    expect(h.toast.messages).toEqual([t('nav.guest.upload')]);
  });

  it('회원은 업로드로 이동을 허용하고 토스트가 없다', () => {
    const h = setup('member');
    expect(h.policy.onUploadPress()).toBe('open-upload');
    expect(h.toast.messages).toEqual([]);
  });
});
