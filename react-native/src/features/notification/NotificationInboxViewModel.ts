import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import { CancelledError, NetworkError } from '../../core/http/ApiError';
import { Observable } from '../../core/state/Observable';
import { formatNotificationTime } from '../../core/time/dateFormat';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type {
  NotificationPage,
  NotificationSummary,
} from '../../data/notification/NotificationModels';
import type { NotificationRepository } from '../../data/notification/NotificationRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { NotificationEvents } from './NotificationEvents';
import type { NotificationTapProcessor } from './NotificationTapProcessor';

export type NotificationItemView = {
  id: string;
  type: string;
  title: string;
  body: string;
  thumbnailUrl: string | null;
  unread: boolean;
  /** KST "M월 d일 HH:mm" (D-09). */
  timeLabel: string;
};

export type NotificationInboxState = {
  status: 'loading' | 'ready' | 'empty' | 'error';
  items: readonly NotificationItemView[];
  hasNext: boolean;
  loadingMore: boolean;
  /** 당겨서 새로고침 중. 기존 목록은 그대로 둔다. */
  refreshing: boolean;
  /** status가 error일 때만 값이 있다. */
  errorMessage: string | null;
};

export type NotificationInboxDeps = {
  notifications: NotificationRepository;
  processor: Pick<NotificationTapProcessor, 'process'>;
  events: NotificationEvents;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
  analytics: AnalyticsTracker;
};

/** 마지막으로 보이는 행이 마지막에서 이 거리 이내면 다음 페이지를 요청한다(REQ-NOTI-005). */
const PREFETCH_DISTANCE = 4;
const AUTH_KEY = 'inbox';

/** 알림함 목록. 화면이 보일 때(onShown) 불러오고, 떠나면(onHidden) 진행 중 요청을 취소한다. */
export class NotificationInboxViewModel extends Observable<NotificationInboxState> {
  private summaries: readonly NotificationSummary[] = [];
  /** 이 세션에서 읽음 처리에 성공한 행(다음 새로고침이 서버 값으로 바꾼다). */
  private readonly readLocally = new Set<string>();
  private readonly pressing = new Set<string>();
  private nextPage = 2;
  /** 첫 페이지 요청(첫 로드·새로고침·조용한 새로고침)이 바뀔 때마다, 그리고 취소·초기화 때 올라간다. 요청 때의 값과 다르면 낡은 응답이다. */
  private generation = 0;
  private controller = new AbortController();
  private tapController = new AbortController();
  private stopEvents: (() => void) | null = null;
  private readonly authErrors: AuthErrorPolicy;

  constructor(private readonly deps: NotificationInboxDeps) {
    super(initialState());
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  /** 화면이 보인다: 처음이면 불러오고, 다시 보이면 읽음 상태 반영을 위해 조용히 첫 페이지를 다시 불러온다. */
  async onShown(): Promise<void> {
    this.deps.analytics.screenView('notifications');
    this.stopEvents ??= this.deps.events.subscribe((event) => {
      if (event.type === 'read') this.markReadLocally(event.notificationId);
      else void this.silentRefresh();
    });
    const { status } = this.getSnapshot();
    if (status === 'loading' || status === 'error') await this.loadFirst();
    else await this.silentRefresh();
  }

  /** 화면을 떠난다: 진행 중 요청을 취소하고 응답을 버린다(오류로 보이지 않는다). */
  onHidden(): void {
    this.stopEvents?.();
    this.stopEvents = null;
    this.invalidate();
    this.tapController.abort();
    this.tapController = new AbortController();
    this.setState((s) => ({ ...s, loadingMore: false, refreshing: false }));
  }

  /** 오류 화면의 "다시 시도". */
  retry(): Promise<void> {
    return this.loadFirst();
  }

  /** 당겨서 새로고침: 첫 페이지로 목록을 교체한다. 실패하면 목록을 유지하고 토스트를 보인다. */
  async refresh(): Promise<void> {
    const generation = this.invalidate();
    this.setState((s) => ({ ...s, refreshing: true }));
    const result = await this.fetchFirst(generation);
    if (result === 'stale') return;
    this.setState((s) => ({ ...s, refreshing: false }));
    if (result === 'ok') return;
    if (result === 'failed' || result === 'failed-network') {
      this.deps.toast.show(t('noti.inbox.refresh-error'));
    }
  }

  /** 화면에 보이는 마지막 행의 인덱스가 바뀔 때 부른다. */
  async onLastVisibleIndexChanged(index: number): Promise<void> {
    const state = this.getSnapshot();
    if (state.status !== 'ready' || !state.hasNext || state.loadingMore || state.refreshing) return;
    if (index < state.items.length - PREFETCH_DISTANCE) return;
    const generation = this.generation;
    this.setState({ ...state, loadingMore: true });
    let page: NotificationPage;
    try {
      page = await this.deps.notifications.list(this.nextPage, this.controller.signal);
    } catch (error) {
      if (generation !== this.generation || error instanceof CancelledError) return;
      this.setState((s) => ({ ...s, loadingMore: false }));
      if (this.authErrors.handle(error, AUTH_KEY)) return;
      // 목록과 페이지 번호는 그대로라 다시 스크롤하면 같은 페이지를 다시 요청한다.
      this.deps.toast.show(t('noti.inbox.more-error'));
      return;
    }
    if (generation !== this.generation) return;
    const known = new Set(this.summaries.map((n) => n.id));
    const added = page.notifications.filter((n) => !known.has(n.id));
    this.summaries = [...this.summaries, ...added];
    this.nextPage += 1;
    this.setState((s) => ({
      ...s,
      items: this.views(),
      // 빈 추가 페이지는 끝으로 본다(서버가 hasNext를 잘못 줘도 무한 요청을 막는다).
      hasNext: page.hasNext && page.notifications.length > 0,
      loadingMore: false,
    }));
  }

  /** 행 탭: 읽음 처리 후 이동은 공유 처리기가 한다. 같은 행의 중복 탭은 무시한다(REQ-NOTI-020). */
  async onItemPressed(id: string): Promise<void> {
    const item = this.summaries.find((n) => n.id === id);
    if (!item || this.pressing.has(id)) return;
    this.pressing.add(id);
    try {
      await this.deps.processor.process(
        {
          type: item.type,
          notificationId: item.id,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
        },
        'inbox',
        this.tapController.signal,
      );
    } finally {
      this.pressing.delete(id);
    }
  }

  /** 로그아웃·계정 전환: 목록을 버리고 늦게 온 응답도 반영하지 않는다. */
  clearAll(): void {
    this.invalidate();
    this.tapController.abort();
    this.tapController = new AbortController();
    this.summaries = [];
    this.readLocally.clear();
    this.nextPage = 2;
    this.setState(initialState());
  }

  override dispose(): void {
    this.onHidden();
    super.dispose();
  }

  private async loadFirst(): Promise<void> {
    const generation = this.invalidate();
    this.setState((s) => ({ ...s, status: 'loading', errorMessage: null }));
    const result = await this.fetchFirst(generation);
    if (result === 'failed' || result === 'failed-network') {
      this.setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: result === 'failed-network' ? t('noti.network') : t('noti.inbox.error'),
      }));
    }
  }

  /** 첫 페이지를 조용히 다시 불러온다. 실패해도 목록을 유지하고 토스트도 없다(REQ-NOTI-012). */
  private async silentRefresh(): Promise<void> {
    await this.fetchFirst(this.invalidate());
  }

  /**
   * 첫 페이지 요청 한 번. ok: 반영함. stale: 낡은 응답/취소(아무것도 안 함). auth: 인증 오류를 로그인 흐름에 넘김.
   * failed / failed-network: 호출자가 화면 정책에 맞게 처리한다.
   */
  private async fetchFirst(
    generation: number,
  ): Promise<'ok' | 'stale' | 'auth' | 'failed' | 'failed-network'> {
    let page: NotificationPage;
    try {
      page = await this.deps.notifications.list(1, this.controller.signal);
    } catch (error) {
      if (generation !== this.generation || error instanceof CancelledError) return 'stale';
      if (this.authErrors.handle(error, AUTH_KEY)) return 'auth';
      return error instanceof NetworkError ? 'failed-network' : 'failed';
    }
    if (generation !== this.generation) return 'stale';
    this.summaries = dedupe(page.notifications);
    this.readLocally.clear();
    this.nextPage = 2;
    this.setState((s) => ({
      ...s,
      status: this.summaries.length === 0 ? 'empty' : 'ready',
      items: this.views(),
      hasNext: page.hasNext && page.notifications.length > 0,
      loadingMore: false,
      errorMessage: null,
    }));
    return 'ok';
  }

  private markReadLocally(id: string): void {
    this.readLocally.add(id);
    this.setState((s) => ({ ...s, items: this.views() }));
  }

  /** 진행 중 요청을 취소하고 그 응답을 낡은 것으로 만든다. 새 세대 번호를 돌려준다. */
  private invalidate(): number {
    this.generation += 1;
    this.controller.abort();
    this.controller = new AbortController();
    // 취소된 요청이 남긴 진행 표시(다음 페이지·당겨서 새로고침)를 지운다. 새 요청이 필요하면 호출자가 다시 켠다.
    this.setState((s) =>
      s.loadingMore || s.refreshing ? { ...s, loadingMore: false, refreshing: false } : s,
    );
    return this.generation;
  }

  private views(): NotificationItemView[] {
    return this.summaries.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      thumbnailUrl: n.thumbnailImageUrl,
      unread: n.readAt === null && !this.readLocally.has(n.id),
      timeLabel: formatNotificationTime(n.createdAt),
    }));
  }
}

function initialState(): NotificationInboxState {
  return {
    status: 'loading',
    items: [],
    hasNext: false,
    loadingMore: false,
    refreshing: false,
    errorMessage: null,
  };
}

function dedupe(list: readonly NotificationSummary[]): NotificationSummary[] {
  const seen = new Set<string>();
  return list.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}
