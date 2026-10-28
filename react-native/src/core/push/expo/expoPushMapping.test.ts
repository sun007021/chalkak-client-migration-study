import {
  fcmTokenFrom,
  foregroundBehaviorFor,
  isRemotePush,
  permissionStatusFrom,
  pushDataFrom,
  pushMessageFrom,
  type ExpoNotificationLike,
} from './expoPushMapping';

const notification = (
  content: ExpoNotificationLike['request']['content'],
  trigger: ExpoNotificationLike['request']['trigger'] = { type: 'push' },
): ExpoNotificationLike => ({ request: { content, trigger } });

describe('expoPushMapping', () => {
  it('TC-PUSH-050 Android remoteMessage.data, iOS payload, content.data 어디서 와도 평탄한 data 맵이 된다', () => {
    const data = { type: 'TOPIC', sourceId: 's' };
    expect(
      pushDataFrom(notification({ data: {} }, { type: 'push', remoteMessage: { data } })),
    ).toEqual(data);
    expect(pushDataFrom(notification({ data }, { type: 'push' }))).toEqual(data);
    expect(pushDataFrom(notification({ data: {} }, { type: 'push', payload: data }))).toEqual(data);
    expect(pushDataFrom(notification({ data: 'x' }, null))).toEqual({});
  });

  it('제목·본문은 문자열일 때만 읽는다', () => {
    expect(pushMessageFrom(notification({ title: 'a', body: null, data: { type: 'x' } }))).toEqual({
      data: { type: 'x' },
      title: 'a',
      body: null,
    });
  });

  it('서버 푸시만 원격 푸시이고, 앱이 만든 로컬 알림(trigger 없음/채널)은 아니다', () => {
    expect(isRemotePush(notification({}, { type: 'push' }))).toBe(true);
    expect(isRemotePush(notification({}, null))).toBe(false);
    expect(isRemotePush(notification({}, { type: 'channel' }))).toBe(false);
  });

  it('포그라운드에서 서버 푸시의 OS 배너는 끄고(중복 방지) 로컬 알림은 보인다', () => {
    expect(foregroundBehaviorFor(notification({}, { type: 'push' })).shouldShowBanner).toBe(false);
    expect(foregroundBehaviorFor(notification({}, null)).shouldShowBanner).toBe(true);
  });

  it('FCM 토큰은 Android 문자열 토큰만 쓰고 iOS(APNs)·빈 값은 null', () => {
    expect(fcmTokenFrom({ type: 'android', data: 'fcm' })).toBe('fcm');
    expect(fcmTokenFrom({ type: 'ios', data: 'apns' })).toBeNull();
    expect(fcmTokenFrom({ type: 'android', data: '' })).toBeNull();
    expect(fcmTokenFrom({ type: 'web', data: {} })).toBeNull();
  });

  it('권한 응답을 granted/denied/undetermined로 바꾼다(iOS 임시 허용 포함)', () => {
    expect(permissionStatusFrom({ status: 'granted', granted: true })).toBe('granted');
    expect(permissionStatusFrom({ status: 'denied', granted: false })).toBe('denied');
    expect(permissionStatusFrom({ status: 'undetermined', granted: false })).toBe('undetermined');
    expect(permissionStatusFrom({ status: 'denied', granted: false, ios: { status: 3 } })).toBe(
      'granted',
    );
  });
});
