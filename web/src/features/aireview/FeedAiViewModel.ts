import type { Clock } from '../../core/time/Clock';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import { ViewModel } from '../../core/state/ViewModel';
import type { FeedAiState } from './aiReviewModels';
import type { AiReviewStore } from './AiReviewStore';

export interface FeedAiViewModelDeps {
  postId: string;
  clock: Clock;
  store: AiReviewStore;
  toast: ToastController;
  /** 홈 "자세히 보기"(location.state.openAiReview)로 들어왔다. 첫 GET이 반영되면 COMPLETED는 결과 시트, FAILED는 실패 시트를 한 번만 연다(REQ-AIR-047). */
  openAiReview: boolean;
}

/** FeedViewModel이 확정한 게시물 정보. isMine은 확정 전에는 진입 경로 값(시드)이다. */
export interface FeedAiPost {
  isMine: boolean;
  topicDate: DateString | null;
}

/**
 * 상세 화면의 AI 영역(알약·시트). FeedViewModel과 따로 만들어 화면(FeedBody)이 setPost로 이어 준다(기존 FeedState를 건드리지 않는다).
 *
 * - setPost: 내 게시물이 되면(그리고 게스트가 아니면) store.watch(postId, { refreshCompleted: true, canRequest })를 만들고 보이는 상태면 show()한다. 내 게시물이 아니면 watch도 GET도 없다(REQ-AIR-001).
 * - onShown/onHidden: 문서 가시성. 가려지면 watch.hide(), 다시 보이면 watch.show()(GET부터 새 창).
 * - onPillPress: request→시작 시트, retry→재요청 시트, view→결과 시트, failed→실패 시트, recheck→watch.recheck(). processing·checking·requesting은 눌러도 아무 일 없다.
 * - confirmStart: 시트를 닫고 request(). 누른 시점에도 자격(오늘 주제)을 다시 확인해 자정이 지났으면 POST를 보내지 않는다. closeSheet: 요청 없음.
 * - onRecheckPress: 폴링 창 종료 뒤 또는 check-failed의 "AI 상태 다시 확인".
 * - 자정(KST)에 자격이 바뀌면 상태를 다시 계산한다(MidnightWatcher). dispose: watch.release(), 타이머 정리.
 */
export class FeedAiViewModel extends ViewModel<FeedAiState> {
  constructor(protected readonly deps: FeedAiViewModelDeps) {
    super({ pill: 'hidden', stalled: false, recheckVisible: false, sheet: { kind: 'none' }, criteriaOpen: false });
  }

  setPost(_post: FeedAiPost): void {
    throw new Error('not implemented');
  }

  onShown(): Promise<void> {
    throw new Error('not implemented');
  }

  onHidden(): void {
    throw new Error('not implemented');
  }

  onPillPress(): void {
    throw new Error('not implemented');
  }

  confirmStart(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 실패 시트의 재요청 버튼(재요청 가능 + 오늘일 때만 있다): 실패 시트를 닫고 재요청 시트를 연다. */
  retryFromFailedSheet(): void {
    throw new Error('not implemented');
  }

  closeSheet(): void {
    throw new Error('not implemented');
  }

  openCriteria(): void {
    throw new Error('not implemented');
  }

  closeCriteria(): void {
    throw new Error('not implemented');
  }

  onRecheckPress(): Promise<void> {
    throw new Error('not implemented');
  }
}
