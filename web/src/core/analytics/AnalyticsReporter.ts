import type { Logger } from '../net/Logger';
import type { AnalyticsTracker } from './AnalyticsTracker';

/**
 * 화면 코드가 쓰는 얇은 API. 허용 목록 밖 screen_name/destination은 보내지 않고,
 * tracker가 던져도 삼키며(logger.warn) 호출자에게 영향을 주지 않는다. 사용자 식별자는 절대 넣지 않는다.
 */
export class AnalyticsReporter {
  constructor(_deps: { tracker: AnalyticsTracker; logger?: Logger }) {}
  /** 허용 목록 밖이면 전송하지 않는다(타입 우회 대비). */
  screenView(_screenName: string, _screenClass?: string): void {
    throw new Error('not implemented');
  }
  /** 탭 4종 외(예: 'upload')는 전송하지 않는다. 같은 탭 재선택도 선택마다 전송(TC-ANL-014 임시안). */
  tabSelected(_destination: string): void {
    throw new Error('not implemented');
  }
}
