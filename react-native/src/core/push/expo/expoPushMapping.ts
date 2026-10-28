import type { PushData } from '../NotificationResponseSource';
import type { PushMessage } from '../PushMessageSource';
import type { PushPermissionStatus } from '../PushPermissionGateway';

// expo-notifications 값을 우리 포트 모양으로 바꾸는 순수 함수들. 네이티브 모듈을 import하지 않아 테스트할 수 있다.

/** expo-notifications `Notification`에서 우리가 읽는 부분. */
export type ExpoNotificationLike = {
  request: {
    content: { title?: string | null; body?: string | null; data?: unknown };
    /** expo의 NotificationTrigger(유니온). 읽을 때 TriggerShape로 좁힌다. */
    trigger?: unknown;
  };
};

type TriggerShape = { type?: unknown; remoteMessage?: { data?: unknown }; payload?: unknown };
const triggerOf = (n: ExpoNotificationLike): TriggerShape =>
  isMap(n.request.trigger) ? (n.request.trigger as TriggerShape) : {};

const isMap = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const nonEmpty = (value: Record<string, unknown> | null): value is Record<string, unknown> =>
  value !== null && Object.keys(value).length > 0;

/** 서버가 보낸 원격 푸시인가(앱이 직접 만든 로컬 알림은 trigger가 푸시가 아니다). */
export function isRemotePush(notification: ExpoNotificationLike): boolean {
  return triggerOf(notification).type === 'push';
}

/**
 * 푸시 `data` 맵. Android는 FCM remoteMessage.data, iOS는 userInfo(payload), 그 밖에는 content.data를 최상위 키 맵으로 쓴다.
 * 중첩 구조는 가정하지 않는다(TC-PUSH-050).
 */
export function pushDataFrom(notification: ExpoNotificationLike): PushData {
  const { content } = notification.request;
  const trigger = triggerOf(notification);
  const remote = trigger.remoteMessage?.data;
  const candidates = [
    isMap(remote) ? remote : null,
    isMap(content.data) ? content.data : null,
    isMap(trigger.payload) ? trigger.payload : null,
  ];
  return candidates.find(nonEmpty) ?? {};
}

export function pushMessageFrom(notification: ExpoNotificationLike): PushMessage {
  const { content } = notification.request;
  return {
    data: pushDataFrom(notification),
    title: typeof content.title === 'string' ? content.title : null,
    body: typeof content.body === 'string' ? content.body : null,
  };
}

/** FCM 토큰만 서버에 등록한다. iOS의 기기 토큰은 APNs 토큰이라 FCM으로 쓸 수 없어 null(README 확인 필요). */
export function fcmTokenFrom(token: { type: string; data: unknown }): string | null {
  return token.type === 'android' && typeof token.data === 'string' && token.data !== ''
    ? token.data
    : null;
}

/** expo 권한 응답 -> 포트 상태. iOS 임시(provisional)·ephemeral 허용도 허용으로 본다. */
export function permissionStatusFrom(response: {
  status: string;
  granted: boolean;
  ios?: { status: number };
}): PushPermissionStatus {
  const IOS_PROVISIONAL = 3;
  const IOS_EPHEMERAL = 4;
  if (
    response.granted ||
    response.ios?.status === IOS_PROVISIONAL ||
    response.ios?.status === IOS_EPHEMERAL
  ) {
    return 'granted';
  }
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

/**
 * 포그라운드 표시 정책: 서버 푸시는 OS 배너로 띄우지 않고(앱이 ForegroundPushHandler로 직접 표시하므로 중복 방지),
 * 앱이 만든 로컬 알림만 OS가 표시한다.
 */
export function foregroundBehaviorFor(notification: ExpoNotificationLike): {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
} {
  const show = !isRemotePush(notification);
  return {
    shouldShowBanner: show,
    shouldShowList: show,
    shouldPlaySound: show,
    shouldSetBadge: false,
  };
}
