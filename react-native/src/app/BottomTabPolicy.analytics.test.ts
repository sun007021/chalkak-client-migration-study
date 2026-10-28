import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeToastPresenter } from '../core/toast/__testing__/FakeToastPresenter';
import type { MainMode } from '../features/auth/AuthFlowNavigator';
import { BottomTabPolicy } from './BottomTabPolicy';

function setup(mode: MainMode) {
  const analytics = new FakeAnalyticsTracker();
  const toast = new FakeToastPresenter();
  return { analytics, policy: new BottomTabPolicy({ mode, analytics, toast }) };
}

describe('BottomTabPolicy 분석 이벤트 (ANL)', () => {
  it('TC-ANL-013 홈, 전시, 기록, 설정을 각각 선택하면 destination별로 1회씩 보낸다', () => {
    const h = setup('member');
    h.policy.onTabPress('Home');
    h.policy.onTabPress('Display');
    h.policy.onTabPress('Record');
    h.policy.onTabPress('Settings');
    expect(h.analytics.events).toEqual(
      ['home', 'display', 'record', 'settings'].map((destination) => ({
        name: 'bottom_navigation_selected',
        params: { destination },
      })),
    );
  });

  it('TC-ANL-014 이미 선택된 탭을 재선택해도 선택 동작마다 전송한다(임시안)', () => {
    const h = setup('member');
    h.policy.onTabPress('Settings');
    h.policy.onTabPress('Settings');
    expect(h.analytics.events).toHaveLength(2);
  });

  it('TC-ANL-015 가운데 업로드 버튼은 bottom_navigation_selected를 보내지 않는다', () => {
    const h = setup('member');
    h.policy.onUploadPress();
    expect(h.analytics.events).toEqual([]);
  });

  it('TC-ANL-016 게스트 제한으로 막힌 기록 탭은 전송하지 않는다(임시안)', () => {
    const h = setup('guest');
    expect(h.policy.onTabPress('Record')).toBe('blocked');
    expect(h.analytics.events).toEqual([]);
  });

  it('TC-ANL-022 게스트도 설정 탭 선택 이벤트를 회원과 같게 보낸다', () => {
    const guest = setup('guest');
    guest.policy.onTabPress('Settings');
    const member = setup('member');
    member.policy.onTabPress('Settings');
    expect(guest.analytics.events).toEqual(member.analytics.events);
  });
});
