import * as SecureStore from 'expo-secure-store';
import { ExpoSecureKeyValueStorage } from './ExpoSecureKeyValueStorage';

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const store = SecureStore as jest.Mocked<typeof SecureStore>;
const OPTIONS = { keychainAccessible: 'after-first-unlock-this-device-only' };

describe('ExpoSecureKeyValueStorage', () => {
  it('TC-AUTH-053 expo-secure-store에 THIS_DEVICE_ONLY 옵션으로 위임한다', async () => {
    store.getItemAsync.mockResolvedValue('v');
    const storage = new ExpoSecureKeyValueStorage();
    expect(await storage.getItem('k')).toBe('v');
    await storage.setItem('k', 'v2');
    await storage.deleteItem('k');
    expect(store.getItemAsync).toHaveBeenCalledWith('k', OPTIONS);
    expect(store.setItemAsync).toHaveBeenCalledWith('k', 'v2', OPTIONS);
    expect(store.deleteItemAsync).toHaveBeenCalledWith('k', OPTIONS);
  });
});
