import type { UserDataCache } from '../UserDataCache';

export class FakeUserDataCache implements UserDataCache {
  clearCalls = 0;
  /** true면 clearAll이 던진다(로컬 정리 실패 상황). */
  failClear = false;

  clearAll(): void {
    this.clearCalls += 1;
    if (this.failClear) throw new Error('clear failed');
  }
}
