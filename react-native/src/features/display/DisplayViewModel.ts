import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { PostSort } from '../../data/post/PostModels';
import type { PostRepository } from '../../data/post/PostRepository';
import type { TopicRepository } from '../../data/topic/TopicRepository';
import type { MainMode } from '../auth/AuthFlowNavigator';
import type { LikeController } from '../like/LikeController';
import type { PostChanges } from '../post/PostChanges';
import type { DisplayNavigator } from './DisplayNavigator';
import type { DisplayState } from './DisplayState';

export type DisplayViewModelDeps = {
  /** 게스트는 목록만 본다: 사진·하트 탭은 API 없이 토스트(D-05). */
  mode: MainMode;
  clock: Clock;
  topics: TopicRepository;
  posts: PostRepository;
  likes: LikeController;
  changes: PostChanges;
  navigator: DisplayNavigator;
  toast: ToastPresenter;
};

/**
 * 전시 탭 상태. (날짜, 정렬)별 캐시, 세대 번호로 늦은 응답 폐기, 랜덤 시드 보관, 좋아요 revision 병합을 맡는다.
 * 계정 전환 때 비우도록 UserDataCache를 구현한다. 소유자(내비게이션)가 만들고 버린다.
 */
export class DisplayViewModel extends Observable<DisplayState> implements UserDataCache {
  constructor(private readonly deps: DisplayViewModelDeps) {
    super(undefined as never);
    void this.deps;
  }

  /** 화면이 보인다: 처음이면 오늘 최신순 로드, 아니면 상한을 갱신하고 첫 페이지를 재검증한다(REQ-DISP-015, 030). */
  onShown(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 화면이 안 보인다: 진행 중 요청을 취소한다(오류로 보이지 않음). */
  onHidden(): void {
    throw new Error('not implemented');
  }

  /** 다른 화면이 날짜(와 정렬)를 지정해 연다(홈 랭킹 더보기, 기록, 업로드 성공). 지정 안 한 정렬은 최신순. */
  openDate(_date: KstDate, _sort?: PostSort): Promise<void> {
    throw new Error('not implemented');
  }

  goPrevious(): Promise<void> {
    throw new Error('not implemented');
  }

  goNext(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 날짜 선택 시트에서 고른 날짜(범위 밖이면 끝으로 맞춘다). 같은 날짜면 재요청하지 않는다. */
  pickDate(_date: KstDate): Promise<void> {
    throw new Error('not implemented');
  }

  selectSort(_sort: PostSort): Promise<void> {
    throw new Error('not implemented');
  }

  /** 화면이 계산한 "보이는 마지막 항목 인덱스". 끝에서 세 번째 이내면 다음 페이지를 요청한다. */
  onLastVisibleIndexChanged(_index: number): Promise<void> {
    throw new Error('not implemented');
  }

  /** 전시 탭 다시 누르기: 맨 위로 + 첫 페이지 재검증. */
  onTabReselected(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 오류 화면의 "다시 시도". */
  retry(): Promise<void> {
    throw new Error('not implemented');
  }

  onFeaturedPageChanged(_page: number): void {
    throw new Error('not implemented');
  }

  onPhotoPress(_postId: string): void {
    throw new Error('not implemented');
  }

  onLikePress(_postId: string): void {
    throw new Error('not implemented');
  }

  clearAll(): void {
    throw new Error('not implemented');
  }
}
