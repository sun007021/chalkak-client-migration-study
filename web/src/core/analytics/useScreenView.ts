import type { ScreenName } from '../../constants';

/** 마운트마다 screen_view 1회. 재렌더·StrictMode 이중 effect로는 다시 보내지 않고, 다른 화면에서 돌아와 다시 마운트되면 보낸다. */
export function useScreenView(_screenName: ScreenName, _screenClass?: string): void {
  throw new Error('not implemented');
}
