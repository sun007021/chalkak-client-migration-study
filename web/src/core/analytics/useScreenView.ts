import { useEffect, useRef } from 'react';
import type { ScreenName } from '../../constants';
import { useAnalytics } from './AnalyticsContext';

/** 마운트마다 screen_view 1회. 재렌더·StrictMode 이중 effect로는 다시 보내지 않고, 다른 화면에서 돌아와 다시 마운트되면 보낸다. */
export function useScreenView(screenName: ScreenName, screenClass?: string): void {
  const reporter = useAnalytics();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    // StrictMode의 이중 effect는 ref를 유지하므로 같은 이름이면 건너뛴다. 실제 재마운트는 새 ref라 다시 보낸다.
    if (sent.current === screenName) return;
    sent.current = screenName;
    reporter.screenView(screenName, screenClass);
  }, [reporter, screenName, screenClass]);
}
