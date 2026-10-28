import { AppState, type AppStateStatus } from 'react-native';

import type { AppState as Visibility, AppVisibility } from './AppVisibility';

/**
 * RN `AppState`를 감싼다. 전환 알림은 `active`(포그라운드)와 `background`만 낸다.
 * iOS의 `inactive`(알림 센터·앱 전환기·통화 화면)는 화면이 곧 돌아오는 일시 상태라 알리지 않는다:
 * 알리면 알림 센터를 내렸다 올릴 때마다 홈이 다시 불러온다.
 * 같은 값이 연달아 오면(background -> inactive 없이 active -> active) 한 번만 알린다.
 */
export class ReactNativeAppVisibility implements AppVisibility {
  /** `background`일 때만 백그라운드다. 콜드 스타트 직후 값이 `unknown`·`inactive`일 수 있어 그때는 포그라운드로 본다. */
  current(): Visibility {
    return AppState.currentState === 'background' ? 'background' : 'foreground';
  }

  subscribe(listener: (state: Visibility) => void): () => void {
    let last: Visibility = this.current();
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      const next = toVisibility(status);
      if (next === null || next === last) return;
      last = next;
      listener(next);
    });
    return () => subscription.remove();
  }
}

function toVisibility(status: AppStateStatus): Visibility | null {
  if (status === 'active') return 'foreground';
  if (status === 'background') return 'background';
  return null;
}
