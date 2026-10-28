import type { Clock } from '../../core/time/Clock';
import { ViewModel } from '../../core/state/ViewModel';
import type { ToastController } from '../../core/ui/ToastController';
import type { DateString } from '../../core/time/kst';
import type { SessionMode } from '../boot/authGate';
import type { ExternalLinkOpener } from '../onboarding/ExternalLinkOpener';
import type { GuestGate } from '../shell/GuestGate';
import type { UploadEntry } from '../shell/UploadEntry';
import type { BannerFeed } from './BannerFeed';
import type { HomeNavigator } from './HomeNavigator';
import type { HomeRepository } from './HomeRepository';
import type { AiReviewStatus, CalendarEntry, HomeTopic, PostSummary } from './homeModels';

/** 오늘 주제 머리글. topic이 null이면 404(주제가 아직 없음)로 오류와 구분한다. */
export type TopicSection = { status: 'loading' } | { status: 'ready'; topic: HomeTopic | null } | { status: 'error' };

/** D-06 히어로 7상태. empty.banned는 /posts/today 403(업로드 진입 때 D-08 안내). thumbnailUrl은 이번 주 기록의 같은 postId에서만 얻고 없으면 null. */
export type HeroState =
  | { kind: 'loading' }
  | { kind: 'no-open-topic' }
  | { kind: 'empty'; banned: boolean }
  | { kind: 'processing' }
  | { kind: 'photo'; postId: string; pending: boolean; thumbnailUrl: string | null }
  | { kind: 'error' };

export interface WeekDay {
  date: DateString;
  entry: CalendarEntry | null;
}

/** days는 일요일부터 7칸, count는 기록이 있는 칸 수("N/7"). */
export type WeeklySection = { status: 'loading' } | { status: 'ready'; days: WeekDay[]; count: number } | { status: 'error' };

/** posts는 서버 순서 앞 5개까지. 비면 "아직 올라온 사진이 없어요". */
export type RankingSection = { status: 'loading' } | { status: 'ready'; posts: PostSummary[] } | { status: 'error' };

/** 어제 랭킹(yesterday)과 오늘 인기(popular). */
export type RankingKey = 'yesterday' | 'popular';

/** AI 피드백 카드. hidden이면 카드가 없다(히어로 APPROVED + 주제 날짜가 KST 오늘일 때만 보이고 404면 숨김). */
export type AiCardState = { kind: 'hidden' } | { kind: 'ready'; postId: string; status: AiReviewStatus; canRequestAgain: boolean; requesting: boolean };

export interface HomeState {
  mode: SessionMode;
  /** 마지막으로 불러온 KST 오늘. 바뀌면 전체를 새 날짜로 다시 불러온다(REQ-HOME-041). */
  todayDate: DateString;
  yesterdayDate: DateString;
  topic: TopicSection;
  hero: HeroState;
  weekly: WeeklySection;
  yesterday: RankingSection;
  popular: RankingSection;
  ai: AiCardState;
  hasUnread: boolean;
  /** 새로고침 표시(home.refresh-indicator). 조용한 갱신(복귀)에서는 false. */
  refreshing: boolean;
}

export interface HomeViewModelDeps {
  mode: SessionMode;
  clock: Clock;
  repository: HomeRepository;
  banners: BannerFeed;
  toast: ToastController;
  guestGate: GuestGate;
  uploadEntry: UploadEntry;
  navigator: HomeNavigator;
  /** 배너를 새 탭으로 연다(Web, 허용 차이). */
  externalLinkOpener: ExternalLinkOpener;
}

/**
 * 홈 탭 로직(화면은 그리기만). 화면이 마운트될 때마다 새로 만든다(홈 탭은 선택할 때마다 새로 보인다).
 * 섹션은 병렬로 독립 로드한다. 게스트는 /posts/today, /posts/calendar, 미읽음, AI를 부르지 않는다.
 */
export class HomeViewModel extends ViewModel<HomeState> {
  constructor(protected readonly deps: HomeViewModelDeps) {
    super(HomeViewModel.initialState(deps));
  }

  private static initialState(_deps: HomeViewModelDeps): HomeState {
    throw new Error('not implemented');
  }

  /** 홈이 보일 때(마운트, 문서 가시성 복귀, 다른 탭에서 돌아옴). 처음이면 전체 로드(섹션 loading), 이미 불러온 뒤면 화면을 비우지 않고 조용히 전체 재요청(REQ-HOME-040). KST 날짜가 바뀌었으면 비우고 새 날짜로 전체 재로드(REQ-HOME-041). */
  onShown(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 홈이 보이지 않게 됨(문서 숨김, 언마운트). 진행 중 요청을 취소하고 이후 실패 토스트를 띄우지 않는다. */
  onHidden(): void {
    throw new Error('not implemented');
  }

  /** 새로고침 버튼(또는 당기기). 콘텐츠 유지 + refreshing + 전체 재요청, 진행 중이면 무시, 실패는 토스트 최대 1건. */
  refresh(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 알림 점만 다시 조회(푸시 수신 이벤트 자리, Web은 푸시가 없어 알림함에서 돌아올 때 onShown이 대신한다). 실패는 조용히. */
  refreshUnread(): Promise<void> {
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
  /** 그 섹션만 다시 부른다. popular는 주제가 이미 있으면 주제를 다시 받지 않는다. */
  retryRanking(_key: RankingKey): Promise<void> {
    throw new Error('not implemented');
  }
  retryBanners(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 히어로 탭. empty: 게스트면 토스트, 정지(banned)면 D-08 토스트, 아니면 uploadEntry.start(). 그 밖의 상태는 아무 일도 없다(Photo는 이동 없음). */
  onHeroPress(): void {
    throw new Error('not implemented');
  }
  /** 알림 벨. 게스트는 토스트, 회원은 navigator.openNotifications(). */
  onNotificationPress(): void {
    throw new Error('not implemented');
  }
  /** 기록이 있는 칸이면 navigator.openRecord(date), 없으면 아무 일도 없다. */
  onWeekDayPress(_date: DateString): void {
    throw new Error('not implemented');
  }
  /** 보러가기 → navigator.openRecord(null). 게스트는 기록 탭 제한 토스트(임시). */
  onWeeklyMorePress(): void {
    throw new Error('not implemented');
  }
  /** 게스트는 feed 토스트, 회원은 navigator.openPostDetail({ postId, seed: 목록 항목 }). */
  onRankingItemPress(_key: RankingKey, _postId: string): void {
    throw new Error('not implemented');
  }
  /** 더 보기 → navigator.openDisplayPopular(해당 섹션 날짜: 어제 또는 오늘). */
  onRankingMorePress(_key: RankingKey): void {
    throw new Error('not implemented');
  }
  /** 배너 → https만 externalLinkOpener.open(새 탭). 그 밖은 차단 토스트, opener 실패는 열기 실패 토스트. */
  onBannerPress(_bannerId: string): void {
    throw new Error('not implemented');
  }
  /** AI 카드 요청/재요청 버튼 → POST 1회(요청 중 연타 무시). 성공하면 PROCESSING. */
  onAiRequestPress(): Promise<void> {
    throw new Error('not implemented');
  }
  /** COMPLETED의 자세히 보기 → navigator.openAiReview(postId). */
  onAiDetailPress(): void {
    throw new Error('not implemented');
  }
}
