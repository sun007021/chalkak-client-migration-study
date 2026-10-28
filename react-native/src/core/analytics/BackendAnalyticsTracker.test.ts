import { ANALYTICS_SCREEN_NAMES, ANALYTICS_TAB_DESTINATIONS } from '../../shared/constants';
import type { AnalyticsTracker } from './AnalyticsTracker';
import type { AnalyticsBackend } from './AnalyticsBackend';
import { BackendAnalyticsTracker } from './BackendAnalyticsTracker';
import { ConsoleAnalyticsTracker } from './ConsoleAnalyticsTracker';
import { createAnalyticsTracker } from './createAnalyticsTracker';

class FakeBackend implements AnalyticsBackend {
  readonly events: { name: string; params: Record<string, string | number | boolean> }[] = [];
  failure: Error | null = null;

  logEvent(name: string, params: Record<string, string | number | boolean>): void {
    if (this.failure) throw this.failure;
    this.events.push({ name, params });
  }
}

function setup() {
  const backend = new FakeBackend();
  const reported: { message: string; error: unknown }[] = [];
  const tracker: AnalyticsTracker = new BackendAnalyticsTracker(backend, (message, error) =>
    reported.push({ message, error }),
  );
  return { backend, reported, tracker };
}

describe('BackendAnalyticsTracker', () => {
  it('TC-ANL-001 화면 코드는 AnalyticsTracker 인터페이스에만 screen_view를 보내고 백엔드가 받는다', () => {
    const { backend, tracker } = setup();
    tracker.screenView('settings');
    expect(backend.events).toEqual([{ name: 'screen_view', params: { screen_name: 'settings' } }]);
  });

  it.each(ANALYTICS_SCREEN_NAMES.map((name) => [name]))(
    'TC-ANL-002 허용 목록의 screen_name %s는 그대로 전송된다',
    (name) => {
      const { backend, tracker } = setup();
      tracker.screenView(name);
      expect(backend.events).toEqual([{ name: 'screen_view', params: { screen_name: name } }]);
    },
  );

  it('TC-ANL-002 허용 목록 밖의 화면 이름은 보내지 않는다', () => {
    const { backend, tracker } = setup();
    tracker.screenView('Settings');
    tracker.screenView('settings ');
    tracker.screenView('secret_screen');
    expect(backend.events).toEqual([]);
  });

  it('TC-ANL-012 screen_view 파라미터는 screen_name뿐이다(개인정보·토큰·ID 없음)', () => {
    const { backend, tracker } = setup();
    tracker.logEvent('screen_view', {
      screen_name: 'feedback',
      user_id: 'u-1',
      token: 'abc',
      content: '비밀',
    });
    expect(backend.events).toEqual([{ name: 'screen_view', params: { screen_name: 'feedback' } }]);
  });

  it('TC-ANL-012 screen_class는 선택 파라미터로 허용된다', () => {
    const { backend, tracker } = setup();
    tracker.logEvent('screen_view', { screen_name: 'home', screen_class: 'HomeScreen' });
    expect(backend.events).toEqual([
      { name: 'screen_view', params: { screen_name: 'home', screen_class: 'HomeScreen' } },
    ]);
  });

  it.each(ANALYTICS_TAB_DESTINATIONS.map((destination) => [destination]))(
    'TC-ANL-013 bottom_navigation_selected destination=%s를 보낸다',
    (destination) => {
      const { backend, tracker } = setup();
      tracker.logEvent('bottom_navigation_selected', { destination });
      expect(backend.events).toEqual([
        { name: 'bottom_navigation_selected', params: { destination } },
      ]);
    },
  );

  it('TC-ANL-015 destination 값은 탭 4종뿐이다(업로드 같은 값은 보내지 않는다)', () => {
    const { backend, tracker } = setup();
    tracker.logEvent('bottom_navigation_selected', { destination: 'upload' });
    expect(backend.events).toEqual([]);
  });

  it('TC-ANL-007 screen_view와 bottom_navigation_selected 외의 이벤트는 보내지 않는다', () => {
    const { backend, tracker } = setup();
    tracker.logEvent('post_uploaded', { postId: 'p-1' });
    tracker.logEvent('feedback_sent', {});
    expect(backend.events).toEqual([]);
  });

  it('TC-ANL-019 만들기만 해서는 어떤 이벤트도 자동으로 보내지 않는다(자동 화면 추적 없음)', () => {
    const { backend } = setup();
    expect(backend.events).toEqual([]);
  });

  it('TC-ANL-021 REQ-ANL-008 백엔드가 예외를 던져도 호출자에게 전파하지 않고 이후 전송은 계속된다', () => {
    const { backend, tracker, reported } = setup();
    backend.failure = new Error('analytics down');
    expect(() => tracker.screenView('home')).not.toThrow();
    expect(() =>
      tracker.logEvent('bottom_navigation_selected', { destination: 'home' }),
    ).not.toThrow();
    expect(reported).toHaveLength(2);
    backend.failure = null;
    tracker.screenView('record');
    expect(backend.events).toEqual([{ name: 'screen_view', params: { screen_name: 'record' } }]);
  });
});

describe('createAnalyticsTracker', () => {
  it('TC-ANL-020 REQ-ANL-001 Firebase 설정 파일이 없어 백엔드가 없으면 로그 출력 구현을 쓰고 크래시하지 않는다', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const tracker = createAnalyticsTracker(null);
    expect(tracker).toBeInstanceOf(ConsoleAnalyticsTracker);
    expect(() => tracker.screenView('home')).not.toThrow();
    expect(info).toHaveBeenCalledWith('[analytics] screen_view', { screen_name: 'home' });
    info.mockRestore();
  });

  it('TC-ANL-001 백엔드가 있으면 BackendAnalyticsTracker로 보낸다', () => {
    const backend = new FakeBackend();
    const tracker = createAnalyticsTracker(backend);
    expect(tracker).toBeInstanceOf(BackendAnalyticsTracker);
    tracker.screenView('feedback');
    expect(backend.events).toEqual([{ name: 'screen_view', params: { screen_name: 'feedback' } }]);
  });
});
