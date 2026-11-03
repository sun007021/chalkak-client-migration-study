import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import { CancelledError, HttpError, NetworkError } from '../../core/http/ApiError';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { NotificationDetail } from '../../data/notification/NotificationModels';
import type { NotificationRepository } from '../../data/notification/NotificationRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { NotificationEvents } from './NotificationEvents';
import type { HomeNotificationTarget } from './NotificationTapProcessor';

export type NotificationDetailView = {
  title: string;
  body: string;
  /** 원본 사진(반려·승인). 없으면 영역을 그리지 않는다. */
  photoUrl: string | null;
  rejectionReason: string | null;
  /** 반려 알림만 "알림함으로" 버튼을 보인다. 새로 올리기 버튼은 없다(REQ-NOTI-026). */
  showBackToInbox: boolean;
};

export type NotificationDetailState = {
  status: 'loading' | 'content' | 'not-found' | 'error';
  errorMessage: string | null;
  detail: NotificationDetailView | null;
};

export type NotificationDetailDeps = {
  notificationId: string;
  notifications: NotificationRepository;
  events: NotificationEvents;
  home: () => HomeNotificationTarget | null;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
  analytics: AnalyticsTracker;
  navigator: { close(): void; openInbox(): void };
};

/** 알림 상세. 조회만 하고 읽음 요청은 보내지 않는다(읽음은 이동 전 단계에서 끝났다). */
export class NotificationDetailViewModel extends Observable<NotificationDetailState> {
  private generation = 0;
  private controller = new AbortController();
  private readonly authErrors: AuthErrorPolicy;

  constructor(private readonly deps: NotificationDetailDeps) {
    super({ status: 'loading', errorMessage: null, detail: null });
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  async onShown(): Promise<void> {
    this.deps.analytics.screenView('notification_detail');
    await this.load();
  }

  onHidden(): void {
    this.invalidate();
  }

  retry(): Promise<void> {
    return this.load();
  }

  onBackPress(): void {
    this.deps.navigator.close();
  }

  onBackToInboxPress(): void {
    this.deps.navigator.openInbox();
  }

  override dispose(): void {
    this.invalidate();
    super.dispose();
  }

  private async load(): Promise<void> {
    const generation = this.invalidate();
    this.setState({ status: 'loading', errorMessage: null, detail: null });
    let detail: NotificationDetail;
    try {
      detail = await this.deps.notifications.getDetail(
        this.deps.notificationId,
        this.controller.signal,
      );
    } catch (error) {
      if (generation !== this.generation || error instanceof CancelledError) return;
      if (this.authErrors.handle(error, 'detail')) return;
      if (error instanceof HttpError && error.status === 404) {
        // 이전 알림 정보를 대신 보여 주지 않는다. 알림함과 미읽음은 다시 불러온다.
        this.setState({ status: 'not-found', errorMessage: null, detail: null });
        this.deps.toast.show(t('noti.gone'));
        this.deps.events.emit({ type: 'gone', notificationId: this.deps.notificationId });
        void this.deps.home()?.onPushReceived();
        return;
      }
      this.setState({
        status: 'error',
        errorMessage: error instanceof NetworkError ? t('noti.network') : t('noti.detail.error'),
        detail: null,
      });
      return;
    }
    if (generation !== this.generation) return;
    this.setState({
      status: 'content',
      errorMessage: null,
      detail: {
        title: detail.title,
        body: detail.body,
        photoUrl: detail.originalImageUrl,
        rejectionReason: detail.rejectionReason,
        showBackToInbox: detail.type === 'POST_REJECTED',
      },
    });
  }

  private invalidate(): number {
    this.generation += 1;
    this.controller.abort();
    this.controller = new AbortController();
    return this.generation;
  }
}
