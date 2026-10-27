/** 분석 이벤트 전송 인터페이스(D-22). 기본 구현은 로그 출력이며 토큰·nonce 같은 비밀값은 params에 넣지 않는다. */
export type AnalyticsParams = Record<string, string | number | boolean>;

export interface AnalyticsTracker {
  /** `screen_view {screen_name}`을 보낸다. 이름은 shared/constants ANALYTICS_SCREEN_NAMES 중 하나. */
  screenView(screenName: string): void;
  logEvent(name: string, params?: AnalyticsParams): void;
}
