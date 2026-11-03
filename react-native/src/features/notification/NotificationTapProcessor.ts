import { CancelledError, NetworkError } from '../../core/http/ApiError';
import type { SessionStore } from '../../core/session/SessionStore';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { NotificationRepository } from '../../data/notification/NotificationRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { HomeViewModel } from '../home/HomeViewModel';
import type { NotificationEvents } from './NotificationEvents';
import type { NotificationNavigator } from './NotificationNavigator';
import { planNotificationTap, type NotificationTapInput } from './NotificationTapPlan';

/** 홈이 알림에 주는 두 통로: 미읽음 재조회(onPushReceived)와 푸시 TOPIC 탭의 맨 위 스크롤 + 새로고침. */
export type HomeNotificationTarget = Pick<HomeViewModel, 'onPushReceived' | 'onHomePushOpened'>;

export type TapOrigin = 'inbox' | 'push';

/**
 * navigated: 이동했다. rejected: 읽음 실패로 토스트만(이동 없음). ignored: 아무 일도 하지 않음(잘못된 행, 취소, 계정 전환).
 * inbox: 푸시가 해석되지 않아 알림함으로 보냈다. auth: 인증 오류를 로그인 흐름에 넘겼다.
 */
export type TapOutcome = 'navigated' | 'rejected' | 'ignored' | 'inbox' | 'auth';

export type NotificationTapProcessorDeps = {
  notifications: Pick<NotificationRepository, 'markRead'>;
  navigator: NotificationNavigator;
  /** 홈 ViewModel은 메인 단계 동안만 있으므로 호출 시점에 찾는다. */
  home: () => HomeNotificationTarget | null;
  events: NotificationEvents;
  sessionStore: Pick<SessionStore, 'generation'>;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

const AUTH_KEY = 'notification-read';

/** 알림함 행 탭과 푸시 탭이 공유하는 D-11 처리: 목적지 결정 -> (필요하면) 읽음 -> 이동. */
export class NotificationTapProcessor {
  private readonly authErrors: AuthErrorPolicy;

  constructor(private readonly deps: NotificationTapProcessorDeps) {
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  async process(
    input: NotificationTapInput,
    origin: TapOrigin,
    signal?: AbortSignal,
  ): Promise<TapOutcome> {
    const { navigator, home } = this.deps;
    const plan = planNotificationTap(input);
    if (plan.kind === 'invalid') {
      if (origin === 'inbox') return 'ignored';
      navigator.openInbox();
      return 'inbox';
    }
    if (plan.kind === 'home') {
      navigator.openHome();
      if (origin === 'push' && plan.refreshHome) void home()?.onHomePushOpened();
      return 'navigated';
    }

    const generation = this.deps.sessionStore.generation();
    const stale = () =>
      signal?.aborted === true || this.deps.sessionStore.generation() !== generation;
    try {
      await this.deps.notifications.markRead(plan.notificationId, signal);
    } catch (error) {
      if (error instanceof CancelledError) return 'ignored';
      // 인증 오류는 세션이 이미 지워졌어도(REAUTH) 로그인 흐름에 맡긴다.
      if (this.authErrors.handle(error, AUTH_KEY)) return 'auth';
      if (stale()) return 'ignored';
      if (error instanceof NetworkError) {
        // 읽음 저장은 실패했지만 이동은 한다. 행은 미읽음으로 남는다.
        this.deps.toast.show(t('noti.read.error.network'));
        this.open(plan);
        return 'navigated';
      }
      this.deps.toast.show(t('noti.gone'));
      this.deps.events.emit({ type: 'gone', notificationId: plan.notificationId });
      void home()?.onPushReceived();
      return 'rejected';
    }
    if (stale()) return 'ignored';
    this.deps.events.emit({ type: 'read', notificationId: plan.notificationId });
    void home()?.onPushReceived();
    this.open(plan);
    return 'navigated';
  }

  private open(
    plan: Exclude<ReturnType<typeof planNotificationTap>, { kind: 'invalid' | 'home' }>,
  ) {
    if (plan.kind === 'post') {
      this.deps.navigator.openPostDetail({ postId: plan.postId, openAiSheet: plan.openAiSheet });
    } else {
      this.deps.navigator.openNotificationDetail(plan.notificationId);
    }
  }
}
