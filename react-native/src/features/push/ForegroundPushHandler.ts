import type { PushMessage, PushMessageSource } from '../../core/push/PushMessageSource';
import type { PushNotificationPresenter } from '../../core/push/PushNotificationPresenter';
import type { PushPermissionGateway } from '../../core/push/PushPermissionGateway';
import { t } from '../../shared/copy';
import type { HomeNotificationTarget } from '../notification/NotificationTapProcessor';

export type ForegroundPushHandlerDeps = {
  messages: PushMessageSource;
  permission: Pick<PushPermissionGateway, 'status'>;
  presenter: PushNotificationPresenter;
  home: () => HomeNotificationTarget | null;
};

/**
 * 앱이 실행 중일 때 도착한 푸시를 처리한다(REQ-PUSH-019, 020):
 * 미읽음을 다시 조회하고, OS 권한이 허용이면 서버가 준 제목·본문으로 알림을 직접 표시한다.
 * 설정이나 type으로 거르지 않는다(수신 제어는 서버 책임, 확인 필요 2번).
 */
export class ForegroundPushHandler {
  constructor(private readonly deps: ForegroundPushHandlerDeps) {}

  start(): () => void {
    return this.deps.messages.subscribe((message) => void this.onMessage(message));
  }

  private async onMessage(message: PushMessage): Promise<void> {
    void this.deps.home()?.onPushReceived();
    try {
      if ((await this.deps.permission.status()) !== 'granted') return;
      await this.deps.presenter.present(
        { title: message.title ?? '', body: message.body ? message.body : t('push.default.body') },
        message.data,
      );
    } catch (error) {
      // 표시 실패는 사용자 동작이 아니므로 알리지 않는다. 오류 종류만 남긴다.
      console.warn(
        '[ForegroundPushHandler] present failed',
        error instanceof Error ? error.name : 'unknown',
      );
    }
  }
}
