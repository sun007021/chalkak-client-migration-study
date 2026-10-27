import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { ScreenName } from '../../constants';
import { useAnalytics } from './AnalyticsContext';

/**
 * react-router 라우트 변경마다(location.key 단위, 뒤로가기 포함) resolve(pathname)이 돌려준 화면 이름으로 screen_view를 보낸다.
 * null이면 보내지 않는다. 초기 로드도 1회 보낸다(자동 page_view는 없음). Router 안에서 렌더하며 아무것도 그리지 않는다.
 */
export function RouteScreenViewTracker({ resolve }: { resolve: (pathname: string) => ScreenName | null }): ReactNode {
  const reporter = useAnalytics();
  const { key, pathname } = useLocation();
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    const name = resolve(pathname);
    if (name) reporter.screenView(name);
  }, [reporter, key, pathname, resolve]);
  return null;
}
