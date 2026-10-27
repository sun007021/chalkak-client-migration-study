import { ANALYTICS_SCREEN_NAMES, ANALYTICS_TAB_DESTINATIONS } from '../../constants';
import type { ScreenName, TabDestination } from '../../constants';
import type { Logger } from '../net/Logger';
import type { AnalyticsEvent, AnalyticsTracker } from './AnalyticsTracker';

const isScreenName = (value: string): value is ScreenName => (ANALYTICS_SCREEN_NAMES as readonly string[]).includes(value);
const isTabDestination = (value: string): value is TabDestination => (ANALYTICS_TAB_DESTINATIONS as readonly string[]).includes(value);

/**
 * 화면 코드가 쓰는 얇은 API. 허용 목록 밖 screen_name/destination은 보내지 않고,
 * tracker가 던져도 삼키며(logger.warn) 호출자에게 영향을 주지 않는다. 사용자 식별자는 절대 넣지 않는다.
 */
export class AnalyticsReporter {
  constructor(private readonly deps: { tracker: AnalyticsTracker; logger?: Logger }) {}

  /** 허용 목록 밖이면 전송하지 않는다(타입 우회 대비). */
  screenView(screenName: string, screenClass?: string): void {
    if (!isScreenName(screenName)) return;
    const params = screenClass === undefined ? { screen_name: screenName } : { screen_name: screenName, screen_class: screenClass };
    this.send({ name: 'screen_view', params });
  }

  /** 탭 4종 외(예: 'upload')는 전송하지 않는다. 같은 탭 재선택도 선택마다 전송(TC-ANL-014 임시안). */
  tabSelected(destination: string): void {
    if (!isTabDestination(destination)) return;
    this.send({ name: 'bottom_navigation_selected', params: { destination } });
  }

  private send(event: AnalyticsEvent): void {
    try {
      this.deps.tracker.track(event);
    } catch (error) {
      this.deps.logger?.log('warn', 'analytics tracker failed', { event: event.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
