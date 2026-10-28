import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PushData } from '../../core/push/NotificationResponseSource';
import type { PendingPushStore } from './PendingPushStore';

const KEY = 'chalkak.push.pending-tap';

/** 보류 중인 푸시 탭 하나를 AsyncStorage에 둔다. 읽을 수 없거나 손상된 값은 없는 것으로 본다. */
export class AsyncStoragePendingPushStore implements PendingPushStore {
  async load(): Promise<PushData | null> {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as PushData)
        : null;
    } catch {
      // 손상된 보류분은 버린다(푸시 탭 하나를 놓칠 뿐이다).
      return null;
    }
  }

  async save(data: PushData | null): Promise<void> {
    if (data === null) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(data));
  }
}
