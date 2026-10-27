import type { UserDataCache } from '../UserDataCache';

export class FakeUserDataCache implements UserDataCache {
  clearCalls = 0;

  clearAll(): void {
    this.clearCalls += 1;
  }
}
