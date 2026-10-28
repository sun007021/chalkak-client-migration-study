import type { Clock } from '../../core/time/Clock';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { PostRepository } from '../../data/post/PostRepository';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { LikeController } from '../like/LikeController';
import type { PostChanges } from '../post/PostChanges';
import type { FeedNavigator } from './FeedNavigator';
import type { FeedState } from './FeedState';
import type { FeedTarget } from './FeedTarget';

export type FeedViewModelDeps = {
  target: FeedTarget;
  /** 저장된 로그인 userId. 상세 응답의 authorId와 비교해 내 게시물을 판정한다(D-26). */
  userId: string;
  clock: Clock;
  posts: PostRepository;
  likes: LikeController;
  changes: PostChanges;
  navigator: FeedNavigator;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

/**
 * 게시물 상세 상태. 한 게시물 하나를 열 때마다 소유자(내비게이션)가 만들고 닫을 때 dispose한다.
 * 좋아요는 LikeController에 위임하고 결과 알림으로 그린다. 상세 응답은 진행 중이거나 끝난 좋아요·제목 수정 결과를 덮지 않는다.
 */
export class FeedViewModel extends Observable<FeedState> {
  constructor(private readonly deps: FeedViewModelDeps) {
    super(undefined as never);
    void this.deps;
  }

  /** 화면이 보인다: 상세를 불러온다(시드가 있으면 시드를 먼저 보여 주고 재검증). 완료까지 resolve. */
  onShown(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 화면 이탈: 진행 중 요청 취소(오류로 보이지 않음). */
  onHidden(): void {
    throw new Error('not implemented');
  }

  /** 오류 화면의 "다시 시도". */
  retry(): Promise<void> {
    throw new Error('not implemented');
  }

  onBackPress(): void {
    throw new Error('not implemented');
  }

  onLikePress(): void {
    throw new Error('not implemented');
  }

  /** 지금 시계 기준으로 수정 버튼을 보일지(내 게시물 + topicDate가 KST 오늘). 자정을 지나면 달라진다. */
  canEditTitle(): boolean {
    throw new Error('not implemented');
  }

  openTitleEditor(): void {
    throw new Error('not implemented');
  }

  closeTitleEditor(): void {
    throw new Error('not implemented');
  }

  onTitleInput(_text: string): void {
    throw new Error('not implemented');
  }

  saveTitle(): Promise<void> {
    throw new Error('not implemented');
  }

  requestDelete(): void {
    throw new Error('not implemented');
  }

  cancelDelete(): void {
    throw new Error('not implemented');
  }

  confirmDelete(): Promise<void> {
    throw new Error('not implemented');
  }
}
