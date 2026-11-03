import type { PushData } from './NotificationResponseSource';

/** 포그라운드에서 도착한 푸시를 앱이 직접 표시한다(REQ-PUSH-019). data를 실어 두면 그 알림을 탭할 때 같은 목적지로 이동한다. */
export interface PushNotificationPresenter {
  present(notification: { title: string; body: string }, data?: PushData): Promise<void>;
}
