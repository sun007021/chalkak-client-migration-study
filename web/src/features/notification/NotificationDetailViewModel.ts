import { ApiError, isAbandoned, NetworkError } from '../../core/net/errors';
import { RequestSlots } from '../../core/state/RequestSlots';
import { ViewModel } from '../../core/state/ViewModel';
import type { NotificationDetail } from './notificationModels';
import type { NotificationRepository } from './NotificationRepository';
import type { NotificationSync } from './notificationSync';

export type DetailBody =
  | { status: 'loading' }
  | { status: 'ready'; detail: NotificationDetail }
  /** 404(REQ-NOTI-027): `noti.gone`을 상태로 보인다(토스트는 없다). 이전 알림 정보를 대신 보여 주지 않는다. */
  | { status: 'gone' }
  /** 연결 실패·타임아웃은 network:true(noti.network), 그 밖은 noti.detail.error. 다시 시도는 retry(). */
  | { status: 'error'; network: boolean };

export interface DetailState {
  body: DetailBody;
}

export interface NotificationDetailDeps {
  notificationId: string;
  repository: NotificationRepository;
  sync: NotificationSync;
}

/**
 * 알림 상세 로직(REQ-NOTI-023~027). 화면이 마운트될 때마다 새로 만들고 dispose한다.
 * - load(): GET /notifications/{id}. 이 호출 외에 PATCH read는 절대 보내지 않는다(조회만으로 읽음 처리하지 않는다, TC-NOTI-041).
 *   성공 → ready. 404 BUSINESS_ERROR(repository가 null) → gone이고 sync.refreshInbox()와 sync.refreshUnread()를 한 번씩 부른다. 연결 실패 → error(network:true), 계약 위반·5xx·그 밖 → error(network:false).
 *   401은 코어가 처리한다(상태 변화 없음). dispose·화면 이탈 뒤 도착한 응답은 상태도 sync도 건드리지 않는다.
 * - retry(): error에서 loading으로 돌아가 다시 읽는다.
 */
export class NotificationDetailViewModel extends ViewModel<DetailState> {
  constructor(protected readonly deps: NotificationDetailDeps) {
    super({ body: { status: 'loading' } });
  }

  private readonly slots = new RequestSlots<'detail'>();

  async load(): Promise<void> {
    const pass = this.slots.begin('detail');
    try {
      const detail = await this.deps.repository.fetchDetail(this.deps.notificationId, pass.signal);
      if (!pass.isCurrent()) return;
      if (detail === null) {
        this.setState({ body: { status: 'gone' } });
        // 다른 화면 갱신이 던져도 gone을 오류로 바꾸지 않는다.
        await Promise.allSettled([(async () => this.deps.sync.refreshInbox())(), (async () => this.deps.sync.refreshUnread())()]);
        return;
      }
      this.setState({ body: { status: 'ready', detail } });
    } catch (error) {
      if (!pass.isCurrent() || isAbandoned(error)) return;
      if (error instanceof ApiError && error.status === 401) return; // 세션 만료는 코어가 처리한다
      this.setState({ body: { status: 'error', network: error instanceof NetworkError } });
    }
  }

  async retry(): Promise<void> {
    if (this.state.body.status !== 'error') return;
    this.setState({ body: { status: 'loading' } });
    await this.load();
  }

  override dispose(): void {
    this.slots.cancelAll();
    super.dispose();
  }
}
