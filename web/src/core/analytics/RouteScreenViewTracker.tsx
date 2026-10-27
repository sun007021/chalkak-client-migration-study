import type { ReactNode } from 'react';
import type { ScreenName } from '../../constants';

/**
 * react-router 라우트 변경마다(location.key 단위, 뒤로가기 포함) resolve(pathname)이 돌려준 화면 이름으로 screen_view를 보낸다.
 * null이면 보내지 않는다. 초기 로드도 1회 보낸다(자동 page_view는 없음). Router 안에서 렌더하며 아무것도 그리지 않는다.
 */
export function RouteScreenViewTracker(_props: { resolve: (pathname: string) => ScreenName | null }): ReactNode {
  throw new Error('not implemented');
}
