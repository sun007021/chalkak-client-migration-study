import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ExpoPushPermissionGateway } from './ExpoPushPermissionGateway';

const getPermissions = jest.mocked(Notifications.getPermissionsAsync);
const requestPermissions = jest.mocked(Notifications.requestPermissionsAsync);

function android(version: number) {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
}

afterEach(() => {
  jest.restoreAllMocks();
  getPermissions.mockClear();
  requestPermissions.mockClear();
});

describe('ExpoPushPermissionGateway 런타임 권한 대상 (REQ-PUSH-003)', () => {
  it('TC-PUSH-008 Android 12 이하(API 32)는 런타임 권한을 요청하지 않고 항상 허용으로 본다', async () => {
    android(32);
    const gateway = new ExpoPushPermissionGateway();
    await expect(gateway.status()).resolves.toBe('granted');
    await expect(gateway.request()).resolves.toBe('granted');
    expect(getPermissions).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it('TC-PUSH-009 Android 13(API 33)부터는 OS 권한을 조회하고 요청한다', async () => {
    android(33);
    getPermissions.mockResolvedValueOnce({ status: 'undetermined', granted: false } as never);
    const gateway = new ExpoPushPermissionGateway();
    await expect(gateway.status()).resolves.toBe('undetermined');
    await gateway.request();
    expect(requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('iOS는 항상 OS 권한을 조회한다', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    getPermissions.mockResolvedValueOnce({ status: 'denied', granted: false } as never);
    await expect(new ExpoPushPermissionGateway().status()).resolves.toBe('denied');
  });
});
