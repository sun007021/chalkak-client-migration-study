import { ANALYTICS_SCREEN_NAMES, ANALYTICS_TAB_DESTINATIONS } from '../../shared/constants';
import type { AnalyticsParams, AnalyticsTracker } from './AnalyticsTracker';
import type { AnalyticsBackend } from './AnalyticsBackend';

type Params = Record<string, string | number | boolean>;

/** 이벤트별 허용 파라미터 키와 값 검증(REQ-ANL-003, 006, 007, 008). */
const EVENTS: Record<string, (params: AnalyticsParams) => Params | null> = {
  screen_view: (params) => {
    const name = params.screen_name;
    if (typeof name !== 'string' || !ANALYTICS_SCREEN_NAMES.includes(name)) return null;
    const result: Params = { screen_name: name };
    if (typeof params.screen_class === 'string') result.screen_class = params.screen_class;
    return result;
  },
  bottom_navigation_selected: (params) => {
    const destination = params.destination;
    if (typeof destination !== 'string' || !ANALYTICS_TAB_DESTINATIONS.includes(destination)) {
      return null;
    }
    return { destination };
  },
};

/**
 * 백엔드로 보내는 AnalyticsTracker. 허용 목록 밖의 이벤트·화면 이름·파라미터는 보내지 않고,
 * 백엔드 예외는 삼킨다(분석 실패가 앱 동작에 영향을 주지 않는다).
 */
export class BackendAnalyticsTracker implements AnalyticsTracker {
  constructor(
    private readonly backend: AnalyticsBackend,
    private readonly reportError: (message: string, error: unknown) => void = (message, error) =>
      console.error(`[analytics] ${message}`, error),
    /** 허용 목록이 거른 이벤트를 알린다. 기본은 개발 중에만 console.warn(운영에서는 조용히 버린다). */
    private readonly reportRejected: (name: string, params: AnalyticsParams) => void = (
      name,
      params,
    ) => {
      if (__DEV__) console.warn(`[analytics] 허용 목록 밖이라 보내지 않음: ${name}`, params);
    },
  ) {}

  screenView(screenName: string): void {
    this.logEvent('screen_view', { screen_name: screenName });
  }

  logEvent(name: string, params: AnalyticsParams = {}): void {
    const sanitize = EVENTS[name];
    const clean = sanitize ? sanitize(params) : null;
    if (clean === null) {
      try {
        this.reportRejected(name, params);
      } catch {
        // 개발용 보고가 실패해도 무시한다.
      }
      return;
    }
    try {
      this.backend.logEvent(name, clean);
    } catch (error) {
      this.reportError(`send failed: ${name}`, error);
    }
  }
}
