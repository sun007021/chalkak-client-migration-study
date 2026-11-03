import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  ANDROID_CHANNEL_ID,
  configureExpoNotifications,
  ensureAndroidChannel,
} from './expoNotificationSetup';
import appConfig from '../../../../app.config';

const setChannel = jest.mocked(Notifications.setNotificationChannelAsync);

beforeEach(() => setChannel.mockClear());
afterEach(() => jest.restoreAllMocks());

// 채널 생성은 모듈에서 한 번만 일어나므로(메모) iOS(생성 안 함) 테스트가 Android 테스트보다 먼저 와야 한다.
describe('Android 알림 채널·아이콘 초기화 (TC-PUSH-072)', () => {
  it('TC-PUSH-072 iOS에서는 채널을 만들지 않는다', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await ensureAndroidChannel();
    expect(setChannel).not.toHaveBeenCalled();
  });

  it('TC-PUSH-072 Android에서 앱 시작 때 채널 moderation_push를 한 번 만든다', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(ANDROID_CHANNEL_ID).toBe('moderation_push');
    configureExpoNotifications();
    await ensureAndroidChannel();
    expect(setChannel).toHaveBeenCalledTimes(1);
    expect(setChannel).toHaveBeenCalledWith(
      'moderation_push',
      expect.objectContaining({ name: expect.any(String) }),
    );
  });

  it('TC-PUSH-072 서버 푸시의 기본 채널과 상태 표시줄 아이콘이 expo-notifications 플러그인에 설정되어 있다', () => {
    const plugin = (appConfig.plugins ?? []).find(
      (entry): entry is [string, Record<string, unknown>] =>
        Array.isArray(entry) && entry[0] === 'expo-notifications',
    );
    expect(plugin?.[1]).toMatchObject({
      defaultChannel: 'moderation_push',
      icon: './assets/android-icon-monochrome.png',
    });
  });
});
