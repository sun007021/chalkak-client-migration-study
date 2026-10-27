import * as SecureStore from 'expo-secure-store';
import type { SecureKeyValueStorage } from './SecureKeyValueStorage';

/** expo-secure-store 어댑터. 백업·기기 이전으로 복원되지 않도록 THIS_DEVICE_ONLY를 쓴다. */
export class ExpoSecureKeyValueStorage implements SecureKeyValueStorage {
  private readonly options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };

  getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key, this.options);
  }

  setItem(key: string, value: string): Promise<void> {
    return SecureStore.setItemAsync(key, value, this.options);
  }

  deleteItem(key: string): Promise<void> {
    return SecureStore.deleteItemAsync(key, this.options);
  }
}
