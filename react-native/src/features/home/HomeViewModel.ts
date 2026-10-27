import type { AppVisibility } from '../../core/lifecycle/AppVisibility';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import { todayKst } from '../../core/time/kst';
import type { NotificationRepository } from '../../data/notification/NotificationRepository';
import type { PostRepository } from '../../data/post/PostRepository';
import type { TopicRepository } from '../../data/topic/TopicRepository';
import type { AiReviewPoller } from '../ai-review/AiReviewPoller';
import type { MainMode } from '../auth/AuthFlowNavigator';
import type { BannerFeedViewModel } from '../banner/BannerFeedViewModel';
import type { LikeController } from '../like/LikeController';
import type { HomeNavigator } from './HomeNavigator';
import type { HomeState, RankingKey } from './HomeState';

export type HomeViewModelDeps = {
  /** 회원/게스트. 게스트는 개인 API(/posts/today, /posts/calendar, AI, 미읽음)를 부르지 않는다(D-05). */
  mode: MainMode;
  clock: Clock;
  topics: TopicRepository;
  posts: PostRepository;
  notifications: NotificationRepository;
  /** ISSUE 섹션의 목록·페이징. 홈이 로드·새로고침·정리를 같이 시킨다. */
  bannerFeed: BannerFeedViewModel;
  likes: LikeController;
  aiReview: AiReviewPoller;
  visibility: AppVisibility;
  navigator: HomeNavigator;
  toast: ToastPresenter;
};

/**
 * 홈 화면 상태. 섹션(주제, 히어로, 주간, 랭킹 2종, 배너, 미읽음)은 병렬로 불러오고 서로 실패에 영향받지 않는다(D-20).
 * 오래된 응답은 세대 번호로 버리고, 취소(화면 이탈)는 오류로 보이지 않는다. 계정 전환 때 비우도록 UserDataCache를 구현한다.
 */
export class HomeViewModel extends Observable<HomeState> implements UserDataCache {
  constructor(private readonly deps: HomeViewModelDeps) {
    const today = todayKst(deps.clock);
    super(initialHomeState(today, today.plusDays(-1)));
  }

  get bannerFeed(): BannerFeedViewModel {
    return this.deps.bannerFeed;
  }

  /**
   * 홈이 보이게 됐다(첫 진입, 다른 탭에서 복귀, 알림함·상세에서 복귀). 포그라운드 구독과 좋아요 구독을 시작한다.
   * 처음이면 모든 섹션을 불러오고(완료까지 resolve), 이미 불러온 적이 있으면 화면을 비우지 않고 조용히 갱신한다.
   * 현재 KST 날짜가 마지막으로 불러온 날짜와 다르면 새 날짜 기준으로 전체를 다시 불러온다. 미읽음도 1회 조회한다.
   */
  onShown(): Promise<void> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** 홈이 안 보이게 됐다: 구독 해제, 진행 중 요청 취소(오류로 보이지 않음), AI 폴링 중단. */
  onHidden(): void {
    throw new Error('not implemented');
  }

  /**
   * 당겨서 새로고침. refreshing 동안 기존 내용을 유지하고 모든 섹션과 배너(1페이지)를 다시 요청한다.
   * 이미 새로고침 중이면 무시한다. 실패한 섹션은 내용을 유지하고 토스트는 한 번에 최대 1건(표시 순서상 첫 실패 섹션,
   * 연결 실패면 common.error.network). 홈이 안 보이면 토스트를 띄우지 않는다.
   */
  refresh(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 푸시를 받았다: 미읽음만 다시 조회한다(D-10). */
  onPushReceived(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 푸시 TOPIC/REMINDER 탭으로 홈이 열렸다: scrollToTopToken을 올리고 새로고침한다(REQ-HOME-044). */
  onHomePushOpened(): Promise<void> {
    throw new Error('not implemented');
  }

  retryTopic(): Promise<void> {
    throw new Error('not implemented');
  }

  retryHero(): Promise<void> {
    throw new Error('not implemented');
  }

  retryWeekly(): Promise<void> {
    throw new Error('not implemented');
  }

  retryRanking(_key: RankingKey): Promise<void> {
    throw new Error('not implemented');
  }

  retryBanners(): Promise<void> {
    throw new Error('not implemented');
  }

  /**
   * 히어로 탭. 게스트: 토스트 home.guest.upload. 정지(empty+banned): 토스트 home.hero.banned, 요청 없음.
   * 일반 Empty: navigator.openUploadGate(). 그 밖의 상태(사진 포함)는 아무 일도 없다.
   */
  onHeroPress(): void {
    throw new Error('not implemented');
  }

  /** 알림 버튼. 게스트: 토스트 home.guest.notification, 요청 없음. 회원: navigator.openNotifications(). */
  onNotificationPress(): void {
    throw new Error('not implemented');
  }

  /** 기록이 있는 칸이면 navigator.openRecord(date), 없는 칸은 아무 일도 없다. */
  onWeekDayPress(_date: KstDate): void {
    throw new Error('not implemented');
  }

  onWeeklyMorePress(): void {
    throw new Error('not implemented');
  }

  /** 게스트: 토스트 home.guest.feed, 이동 없음. 회원: navigator.openPostDetail({postId, seed: 목록 항목}). */
  onRankingItemPress(_key: RankingKey, _postId: string): void {
    throw new Error('not implemented');
  }

  /** 해당 섹션 날짜(어제/오늘)의 전시 인기순. */
  onRankingMorePress(_key: RankingKey): void {
    throw new Error('not implemented');
  }

  /** 게스트: 토스트 home.guest.like. 회원: LikeController.toggle(현재 표시 값)에 위임하고 결과는 컨트롤러 알림으로 반영한다. */
  onRankingLikePress(_key: RankingKey, _postId: string): void {
    throw new Error('not implemented');
  }

  onBannerPress(_bannerId: string): void {
    throw new Error('not implemented');
  }

  /** 계정 전환·로그아웃: 상태와 진행 중 요청을 비운다. 이전 계정 요청의 늦은 응답은 무시한다. */
  clearAll(): void {
    throw new Error('not implemented');
  }

  override dispose(): void {
    throw new Error('not implemented');
  }
}

function initialHomeState(today: KstDate, yesterday: KstDate): HomeState {
  return {
    todayDate: today,
    yesterdayDate: yesterday,
    topic: { status: 'loading' },
    hero: { kind: 'loading' },
    weekly: { status: 'loading' },
    yesterday: { status: 'loading' },
    popular: { status: 'loading' },
    aiCardPostId: null,
    hasUnread: false,
    refreshing: false,
    scrollToTopToken: 0,
  };
}
