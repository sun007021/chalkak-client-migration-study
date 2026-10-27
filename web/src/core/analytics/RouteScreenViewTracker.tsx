import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { ScreenName } from '../../constants';
import { useAnalytics } from './AnalyticsContext';

/**
 * 정식 화면 추적 경로: react-router의 pathname이 바뀔 때마다(뒤로가기·다른 화면에 갔다 돌아온 재방문 포함) resolve(pathname)이 돌려준
 * 화면 이름으로 screen_view를 보낸다. 쿼리·해시만 바뀌면 같은 화면이므로 보내지 않는다. null이면 보내지 않는다. 초기 로드도 1회 보낸다(자동 page_view는 없음). Router 안에서 렌더하며 아무것도 그리지 않는다.
 */
export function RouteScreenViewTracker({ resolve }: { resolve: (pathname: string) => ScreenName | null }): ReactNode {
  const reporter = useAnalytics();
  const { pathname } = useLocation();
  const lastPathname = useRef<string | null>(null);
  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    const name = resolve(pathname);
    if (name) reporter.screenView(name);
  }, [reporter, pathname, resolve]);
  return null;
}
