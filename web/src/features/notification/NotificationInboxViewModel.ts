import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import type { ToastController } from '../../core/ui/ToastController';
import type { NotificationItem } from './notificationModels';
import type { NotificationNavigator } from './notificationNavigation';
import type { NotificationRepository } from './NotificationRepository';
import type { NotificationSync } from './notificationSync';

export type InboxBody =
  /** 첫 로딩(보이는 알림이 없는 상태). 문구 "알림을 불러오는 중이에요"(noti.inbox.loading). */
  | { status: 'loading' }
  /** 성공했는데 0건(REQ-NOTI-008). 당겨서 새로고침으로 다시 받을 수 있다. */
  | { status: 'empty' }
  /** 콘텐츠 없이 첫 로딩 실패. network는 연결 실패·타임아웃(→ noti.network), 그 밖(5xx·계약 위반·404 등)은 noti.inbox.error. 다시 시도는 retry(). */
  | { status: 'error'; network: boolean }
  /** items는 서버 순서(최신순), 페이지 누적, id 중복 제거. */
  | { status: 'ready'; items: NotificationItem[]; hasNext: boolean };

export interface InboxState {
  body: InboxBody;
  /** 당겨서 새로고침(refresh()) 중. 기존 목록·빈 상태를 유지한 채 notifications.refresh-indicator를 보인다. 조용한 재검증(onShown·revalidate)은 켜지 않는다. */
  refreshing: boolean;
  /** 다음 페이지 요청 중(notifications.load-more-indicator). */
  paging: boolean;
  /** 다음 페이지 요청이 실패한 횟수. 화면이 센티넬을 다시 세우는 열쇠로 쓴다(다시 스크롤하면 같은 페이지를 다시 요청, REQ-NOTI-011). */
  pageFailures: number;
}

export interface NotificationInboxDeps {
  repository: NotificationRepository;
  toast: ToastController;
  navigator: NotificationNavigator;
  sync: Pick<NotificationSync, 'refreshUnread'>;
  /** 읽음 성공 때 행의 readAt을 clock.nowMs()로 채운다(이미 읽은 행은 최초 값 유지). Date.now 금지. */
  clock: Clock;
}

/** 목록 끝에서 이 개수 안의 항목이 보이면 다음 페이지를 요청한다(REQ-NOTI-005). */
export const INBOX_SENTINEL_OFFSET = 4;

/**
 * 알림함 목록 로직(화면은 그리기만). 컨테이너가 하나를 보관하고(inboxSession) 화면은 붙었다 떨어진다: 상세·피드에 갔다 와도 목록이 남는다.
 *
 * 수명
 * - onShown: 목록이 ready·empty면 화면을 비우지 않고 첫 페이지를 조용히 재검증한다(revalidate, REQ-NOTI-012). 그 밖(처음, 첫 로딩이 끝나기 전에 가려졌던 경우, 오류 화면)은 첫 페이지를 처음부터 읽는다(loading → ready/empty/error).
 * - onHidden: 진행 중 요청(목록·다음 페이지·읽음)을 무효화한다. 취소는 오류 토스트·오류 화면이 되지 않는다(TC-NOTI-022, 039). 첫 로딩 중이었으면 다음 onShown이 처음부터 다시 읽는다.
 * - resetForAccountChange: 로그아웃·계정 전환(UserCaches). 목록·페이지·진행 중 요청을 버리고 처음 상태(loading)로 돌린다. 이전 계정의 늦은 응답·읽음 결과는 반영도 이동도 하지 않는다(TC-NOTI-040, 053).
 *
 * 목록
 * - 첫 페이지: GET page=1. 실패하면 콘텐츠가 없으므로 오류 화면(연결 실패 network:true, 그 밖 false). 목록 404는 방어용 fixture라 "그 밖"으로 보고 오류 화면(`noti.inbox.error`, noti.gone·자동 재요청 없음, 임시 결정).
 * - 401: 갱신·세션 만료는 코어가 처리한다. ViewModel은 토스트도 오류 화면도 만들지 않고 상태를 그대로 둔다(REQ 실패 표: 로그인 화면, 문구 없음).
 * - refresh(): 첫 페이지를 다시 받아 목록을 교체하고 페이지를 1로 되돌린다(hasNext도 응답 기준). 실패하면 기존 목록·빈 상태를 유지하고 토스트 `noti.inbox.refresh-error`. 더 새 첫 페이지 요청이 시작되면 이전 요청의 늦은 응답은 버린다(최신 우선, TC-NOTI-021).
 *   진행 중이던 다음 페이지 요청은 무효가 된다(paging=false). 오류 화면에서는 retry()를 쓴다.
 * - revalidate(): refresh와 같되 조용하다(refreshing 안 켬, 실패해도 토스트 없고 기존 목록 유지). 첫 페이지 항목만 교체하고 뒤쪽 페이지(이미 읽은 2페이지 이후)는 유지한다(id 중복 제거, hasNext는 마지막으로 읽은 페이지 기준 유지). ready·empty일 때만 동작하고 loading·error에서는 아무 일도 하지 않는다. empty에서 항목이 생기면 ready가 된다.
 * - 다음 페이지: onLastVisibleIndexChanged(index)가 index >= items.length - INBOX_SENTINEL_OFFSET이면, 또는 onSentinelVisible()이 불리면 요청한다. ready이고 hasNext이며 paging·refreshing이 아닐 때만(중복 요청 없음, REQ-NOTI-006).
 *   page = 지금까지 받은 페이지 수 + 1. 성공하면 뒤에 붙인다(이미 있는 id는 건너뜀, 서버 순서 유지). 실패하면 목록과 페이지 번호를 유지하고 토스트 `noti.inbox.more-error`, pageFailures += 1, 다시 부르면 같은 페이지를 다시 요청한다.
 *
 * 행 탭 (onItemPress(id), REQ-NOTI-015~022, planRowTap)
 * - 목록에 없는 id, plan이 ignore면 아무 일도 없다(요청·이동·토스트 없음). home이면 읽음 요청 없이 navigator.openHome().
 * - read: 다른 행 탭이 진행 중이면 무시한다(연타 방지, 읽음 요청과 이동은 한 번, 임시: 행과 무관하게 한 번에 하나). 이미 읽은 행도 PATCH를 보낸다(멱등, 확인 필요 3).
 *   성공(204): 그 행의 readAt이 null이면 clock.nowMs()로 채우고(읽은 행은 최초 값 유지), sync.refreshUnread()를 부르고, 목적지로 이동한다(post → openPost, detail → openDetail).
 *   연결 실패·타임아웃(NetworkError): 토스트 `noti.read.error.network`, 행은 미읽음 그대로, 그래도 목적지로 이동한다. 이때 미읽음 재조회는 하지 않는다.
 *   401(갱신 불가·REAUTH): 토스트·이동 없음(세션 만료는 코어가 로그인 화면으로 보낸다).
 *   404와 그 밖의 오류(403·400·5xx 등): 이동하지 않고 토스트 `noti.gone`, revalidate()와 sync.refreshUnread().
 *   요청 중 onHidden·resetForAccountChange가 있었으면 응답이 와도 이동·토스트·상태 반영을 하지 않는다(TC-NOTI-039, 040). 응답은 읽음 요청이 서버에 이미 반영됐을 수 있어도 무시한다.
 * - 이 ViewModel은 PostChanges와 엮이지 않는다(알림 규칙에 게시물 변경 연동이 없다).
 */
export class NotificationInboxViewModel extends ViewModel<InboxState> {
  constructor(protected readonly deps: NotificationInboxDeps) {
    super({ body: { status: 'loading' }, refreshing: false, paging: false, pageFailures: 0 });
  }

  onShown(): Promise<void> {
    throw new Error('not implemented');
  }

  onHidden(): void {
    throw new Error('not implemented');
  }

  retry(): Promise<void> {
    throw new Error('not implemented');
  }

  refresh(): Promise<void> {
    throw new Error('not implemented');
  }

  revalidate(): Promise<void> {
    throw new Error('not implemented');
  }

  onSentinelVisible(): Promise<void> {
    throw new Error('not implemented');
  }

  onLastVisibleIndexChanged(_index: number): Promise<void> {
    throw new Error('not implemented');
  }

  onItemPress(_id: string): Promise<void> {
    throw new Error('not implemented');
  }

  resetForAccountChange(): void {
    throw new Error('not implemented');
  }
}
