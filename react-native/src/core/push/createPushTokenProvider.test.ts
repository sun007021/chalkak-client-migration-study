import type { AppInfo } from '../config/AppInfo';
import { createPushTokenProvider } from './createPushTokenProvider';
import { ExpoPushTokenProvider } from './expo/ExpoPushTokenProvider';
import { FirebaseMessagingTokenProvider } from './firebase/FirebaseMessagingTokenProvider';

const info = (patch: Partial<AppInfo>): AppInfo => ({
  platform: 'ios',
  bundleId: 'b',
  version: '1',
  appStoreId: null,
  iosFcmEnabled: false,
  ...patch,
});

describe('createPushTokenProvider', () => {
  it('iOS + iosFcmEnabled이면 Firebase 공급자를 쓴다', () => {
    expect(createPushTokenProvider(info({ iosFcmEnabled: true }))).toBeInstanceOf(
      FirebaseMessagingTokenProvider,
    );
  });

  it('iOS인데 꺼져 있으면(Firebase 설정 없는 빌드) 기존 공급자(iOS는 null)를 쓴다', () => {
    expect(createPushTokenProvider(info({}))).toBeInstanceOf(ExpoPushTokenProvider);
  });

  it('Android는 플래그와 상관없이 기존 공급자다', () => {
    expect(createPushTokenProvider(info({ platform: 'android' }))).toBeInstanceOf(
      ExpoPushTokenProvider,
    );
    expect(
      createPushTokenProvider(info({ platform: 'android', iosFcmEnabled: true })),
    ).toBeInstanceOf(ExpoPushTokenProvider);
  });
});
