import { AnalyticsReporter } from './AnalyticsReporter';
import { type AnalyticsEvent, type AnalyticsTracker } from './AnalyticsTracker';
import { FakeAnalyticsTracker } from '../../test/FakeAnalyticsTracker';
import { RecordingLogger } from '../../test/RecordingLogger';
import { ANALYTICS_SCREEN_NAMES, ANALYTICS_TAB_DESTINATIONS } from '../../constants';

function setup() {
  const tracker = new FakeAnalyticsTracker();
  const logger = new RecordingLogger();
  return { tracker, logger, reporter: new AnalyticsReporter({ tracker, logger }) };
}

describe('AnalyticsReporter', () => {
  it('TC-ANL-001 TC-ANL-012 screen_view는 screen_name(필수)과 선택 screen_class만 가진다', () => {
    const { tracker, reporter } = setup();
    reporter.screenView('home');
    reporter.screenView('feed', 'FeedPage');
    expect(tracker.events).toEqual([
      { name: 'screen_view', params: { screen_name: 'home' } },
      { name: 'screen_view', params: { screen_name: 'feed', screen_class: 'FeedPage' } },
    ]);
  });

  it('TC-ANL-002 허용된 19종 이름은 모두 그대로 전송된다', () => {
    const { tracker, reporter } = setup();
    ANALYTICS_SCREEN_NAMES.forEach((n) => reporter.screenView(n));
    expect(tracker.events.map((e) => (e.name === 'screen_view' ? e.params.screen_name : null))).toEqual([...ANALYTICS_SCREEN_NAMES]);
  });

  it('TC-ANL-002 허용 목록 밖 screen_name은 전송하지 않는다', () => {
    const { tracker, reporter } = setup();
    reporter.screenView('Home');
    reporter.screenView('unknown_screen');
    reporter.screenView('');
    expect(tracker.events).toEqual([]);
  });

  it.each(ANALYTICS_TAB_DESTINATIONS)('TC-ANL-013 탭 %s 선택은 bottom_navigation_selected {destination}으로 전송된다', (dest) => {
    const { tracker, reporter } = setup();
    reporter.tabSelected(dest);
    expect(tracker.events).toEqual([{ name: 'bottom_navigation_selected', params: { destination: dest } }]);
  });

  it('TC-ANL-014 이미 선택된 탭을 다시 선택해도 선택마다 전송한다(임시안)', () => {
    const { tracker, reporter } = setup();
    reporter.tabSelected('home');
    reporter.tabSelected('home');
    expect(tracker.events).toHaveLength(2);
  });

  it('TC-ANL-015 가운데 업로드 버튼(upload)이나 알 수 없는 destination은 전송하지 않는다', () => {
    const { tracker, reporter } = setup();
    reporter.tabSelected('upload');
    reporter.tabSelected('');
    expect(tracker.events).toEqual([]);
  });

  it('TC-ANL-012 TC-ANL-022 이벤트에는 사용자 식별자·토큰 같은 파라미터가 없다(게스트와 회원이 같다)', () => {
    const { tracker, reporter } = setup();
    reporter.screenView('home');
    reporter.tabSelected('record');
    const allowedKeys = new Set(['screen_name', 'screen_class', 'destination']);
    for (const e of tracker.events) {
      expect(Object.keys(e.params).every((k) => allowedKeys.has(k))).toBe(true);
    }
    expect(tracker.events.map((e) => e.name)).toEqual(['screen_view', 'bottom_navigation_selected']);
  });

  it('TC-ANL-021 tracker가 던져도 호출자에게 전파하지 않고 warn 로그만 남긴다', () => {
    const logger = new RecordingLogger();
    const broken: AnalyticsTracker = {
      track(_e: AnalyticsEvent) {
        throw new Error('sdk exploded');
      },
    };
    const reporter = new AnalyticsReporter({ tracker: broken, logger });
    expect(() => reporter.screenView('home')).not.toThrow();
    expect(() => reporter.tabSelected('home')).not.toThrow();
    expect(logger.entries.some((e) => e.level === 'warn')).toBe(true);
  });
});
