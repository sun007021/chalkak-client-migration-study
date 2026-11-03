import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PushPromptFlagStore } from '../PushPromptFlagStore';

const KEY = 'chalkak.push.permission-requested';

/** 앱 설치 단위 표시(AsyncStorage). 키체인에 남는 SecureStore와 달리 재설치하면 사라진다. */
export class AsyncStoragePushPromptFlagStore implements PushPromptFlagStore {
  async wasRequested(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEY)) === '1';
  }

  async markRequested(): Promise<void> {
    await AsyncStorage.setItem(KEY, '1');
  }
}
