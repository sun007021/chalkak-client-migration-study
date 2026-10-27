import type { AppVisibility } from '../../core/lifecycle/AppVisibility';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import { CancelledError, HttpError, NetworkError } from '../../core/http/ApiError';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import { monthsSpanned, todayKst, weekOf } from '../../core/time/kst';
import type { NotificationRepository } from '../../data/notification/NotificationRepository';
import type { CalendarEntry, PostSummary } from '../../data/post/PostModels';
import type { PostRepository } from '../../data/post/PostRepository';
import type { Topic } from '../../data/topic/Topic';
import type { TopicRepository } from '../../data/topic/TopicRepository';
import { format, t } from '../../shared/copy';
import type { AiReviewPoller } from '../ai-review/AiReviewPoller';
import type { MainMode } from '../auth/AuthFlowNavigator';
import type { BannerFeedViewModel } from '../banner/BannerFeedViewModel';
import type { LikeChange, LikeController } from '../like/LikeController';
import type { HomeNavigator } from './HomeNavigator';
import type { HeroState, HomeState, RankingKey, RankingSection } from './HomeState';

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

/** 홈이 요청 결과로 보여 주는 섹션. 순서는 화면에 위에서 아래로 나타나는 순서다(실패 토스트의 우선순위). */
type SectionKey = 'topic' | 'hero' | 'weekly' | 'yesterday' | 'popular' | 'banner';
const SECTION_ORDER: readonly SectionKey[] = [
  'topic',
  'hero',
  'weekly',
  'yesterday',
  'popular',
  'banner',
];

/** 새로고침에서 "내용이 있던 섹션"이 실패한 기록. 내용이 없던 섹션은 오류 UI가 있으므로 토스트 대상이 아니다. */
type Failure = { section: SectionKey; network: boolean };

type Outcome<T> =
  { kind: 'ok'; value: T } | { kind: 'cancelled' } | { kind: 'error'; error: unknown };

/** 요청 한 세트의 식별. 세대 번호가 바뀌면(새로고침·이탈·계정 전환) 이 세트의 응답은 버린다. */
type RequestContext = { token: number; signal: AbortSignal };

const RANKING_LIMIT = 5;

const isHttp = (error: unknown, status: number): boolean =>
  error instanceof HttpError && error.status === status;

/**
 * 홈 화면 상태. 섹션(주제, 히어로, 주간, 랭킹 2종, 배너, 미읽음)은 병렬로 불러오고 서로 실패에 영향받지 않는다(D-20).
 * 오래된 응답은 세대 번호로 버리고, 취소(화면 이탈)는 오류로 보이지 않는다. 계정 전환 때 비우도록 UserDataCache를 구현한다.
 *
 * 불러오기 규칙(한 곳): 응답이 성공하면 교체하고, 실패하면 이미 내용이 있으면 유지, 없으면 그 섹션만 error로 둔다.
 * 최초·복귀·날짜 변경은 조용히(`reload`), 당겨서 새로고침만 `refreshing`과 실패 토스트를 쓴다.
 */
export class HomeViewModel extends Observable<HomeState> implements UserDataCache {
  private generation = 0;
  private controller = new AbortController();
  private shown = false;
  private refreshInFlight: Promise<void> | null = null;
  private stopVisibility: (() => void) | null = null;
  private stopLikes: (() => void) | null = null;

  /** 히어로 응답에서 얻은 상태(썸네일은 비어 있음). 달력 응답이 늦게 와도 썸네일만 다시 채워 낸다. */
  private heroBase: HeroState | null = null;
  /** /posts/today 응답의 주제 날짜. AI 카드 노출 판정(KST 오늘)에 쓴다. */
  private heroTopicDate: KstDate | null = null;
  private calendarEntries: readonly CalendarEntry[] = [];
  /** AI 폴러를 시작해 둔 게시물. 같은 게시물로 폴러를 또 시작하지 않으려는 기록이다. */
  private polledPostId: string | null = null;

  constructor(private readonly deps: HomeViewModelDeps) {
    const today = todayKst(deps.clock);
    super(initialHomeState(today, today.plusDays(-1)));
  }

  get bannerFeed(): BannerFeedViewModel {
    return this.deps.bannerFeed;
  }

  private get isMember(): boolean {
    return this.deps.mode === 'member';
  }

  /**
   * 홈이 보이게 됐다(첫 진입, 다른 탭에서 복귀, 알림함·상세에서 복귀). 포그라운드 구독과 좋아요 구독을 시작한다.
   * 처음이면 모든 섹션을 불러오고(완료까지 resolve), 이미 불러온 적이 있으면 화면을 비우지 않고 조용히 갱신한다.
   * 현재 KST 날짜가 마지막으로 불러온 날짜와 다르면 새 날짜 기준으로 전체를 다시 불러온다. 미읽음도 1회 조회한다.
   */
  onShown(): Promise<void> {
    this.shown = true;
    this.stopVisibility ??= this.deps.visibility.subscribe((state) => this.onVisibility(state));
    this.stopLikes ??= this.deps.likes.subscribe((change) => this.onLikeChange(change));
    return this.quietReload();
  }

  /** 홈이 안 보이게 됐다: 구독 해제, 진행 중 요청 취소(오류로 보이지 않음), AI 폴링 중단. */
  onHidden(): void {
    this.shown = false;
    this.stopVisibility?.();
    this.stopVisibility = null;
    this.stopLikes?.();
    this.stopLikes = null;
    this.invalidate();
    this.setState((s) => (s.refreshing ? { ...s, refreshing: false } : s));
    this.deps.bannerFeed.cancelPending();
    this.stopAiPoller();
  }

  /**
   * 당겨서 새로고침. refreshing 동안 기존 내용을 유지하고 모든 섹션과 배너(1페이지)를 다시 요청한다.
   * 이미 새로고침 중이면 무시한다. 실패한 섹션은 내용을 유지하고 토스트는 한 번에 최대 1건(표시 순서상 첫 실패 섹션,
   * 연결 실패면 common.error.network). 홈이 안 보이면 토스트를 띄우지 않는다.
   */
  refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.ensureCurrentDay();
    const ctx = this.beginRequests();
    this.setState((s) => ({ ...s, refreshing: true }));
    const run = (async () => {
      const failures = await this.reload(ctx);
      if (ctx.token !== this.generation) return;
      this.setState((s) => ({ ...s, refreshing: false }));
      const first = [...failures].sort(
        (a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section),
      )[0];
      if (this.shown && first) this.deps.toast.show(this.failureMessage(first));
    })().finally(() => {
      if (this.refreshInFlight === run) this.refreshInFlight = null;
    });
    this.refreshInFlight = run;
    return run;
  }

  /** 푸시를 받았다: 미읽음만 다시 조회한다(D-10). */
  async onPushReceived(): Promise<void> {
    await this.loadUnread(this.currentContext());
  }

  /** 푸시 TOPIC/REMINDER 탭으로 홈이 열렸다: scrollToTopToken을 올리고 새로고침한다(REQ-HOME-044). */
  onHomePushOpened(): Promise<void> {
    this.setState((s) => ({ ...s, scrollToTopToken: s.scrollToTopToken + 1 }));
    return this.refresh();
  }

  async retryTopic(): Promise<void> {
    this.setState((s) => ({ ...s, topic: { status: 'loading' }, popular: { status: 'loading' } }));
    await this.loadTodayGroup(this.currentContext());
  }

  async retryHero(): Promise<void> {
    this.heroBase = null;
    this.setState((s) => ({ ...s, hero: { kind: 'loading' }, aiCardPostId: null }));
    this.syncAiPoller(null);
    await this.loadHero(this.currentContext());
  }

  async retryWeekly(): Promise<void> {
    this.setState((s) => ({ ...s, weekly: { status: 'loading' } }));
    await this.loadWeekly(this.currentContext());
  }

  async retryRanking(key: RankingKey): Promise<void> {
    this.setState((s) => ({ ...s, [key]: { status: 'loading' } }));
    const ctx = this.currentContext();
    if (key === 'popular') await this.loadTodayGroup(ctx, { topicSettled: true });
    else await this.loadYesterday(ctx);
  }

  async retryBanners(): Promise<void> {
    await this.deps.bannerFeed.load();
  }

  /**
   * 히어로 탭. 게스트: 토스트 home.guest.upload. 정지(empty+banned): 토스트 home.hero.banned, 요청 없음.
   * 일반 Empty: navigator.openUploadGate(). 그 밖의 상태(사진 포함)는 아무 일도 없다.
   */
  onHeroPress(): void {
    if (!this.isMember) {
      this.deps.toast.show(t('home.guest.upload'));
      return;
    }
    const { hero } = this.getSnapshot();
    if (hero.kind !== 'empty') return;
    if (hero.banned) this.deps.toast.show(t('home.hero.banned'));
    else this.deps.navigator.openUploadGate();
  }

  /** 알림 버튼. 게스트: 토스트 home.guest.notification, 요청 없음. 회원: navigator.openNotifications(). */
  onNotificationPress(): void {
    if (!this.isMember) this.deps.toast.show(t('home.guest.notification'));
    else this.deps.navigator.openNotifications();
  }

  /** 기록이 있는 칸이면 navigator.openRecord(date), 없는 칸은 아무 일도 없다. */
  onWeekDayPress(date: KstDate): void {
    const { weekly } = this.getSnapshot();
    if (weekly.status !== 'ready') return;
    const day = weekly.days.find((d) => d.date.equals(date));
    if (day?.entry) this.deps.navigator.openRecord(date);
  }

  onWeeklyMorePress(): void {
    this.deps.navigator.openRecord(null);
  }

  /** 게스트: 토스트 home.guest.feed, 이동 없음. 회원: navigator.openPostDetail({postId, seed: 목록 항목}). */
  onRankingItemPress(key: RankingKey, postId: string): void {
    if (!this.isMember) {
      this.deps.toast.show(t('home.guest.feed'));
      return;
    }
    const seed = this.findPost(key, postId);
    if (seed) this.deps.navigator.openPostDetail({ postId, seed });
  }

  /** 해당 섹션 날짜(어제/오늘)의 전시 인기순. */
  onRankingMorePress(key: RankingKey): void {
    const state = this.getSnapshot();
    this.deps.navigator.openDisplayPopular(
      key === 'yesterday' ? state.yesterdayDate : state.todayDate,
    );
  }

  /** 게스트: 토스트 home.guest.like. 회원: LikeController.toggle(현재 표시 값)에 위임하고 결과는 컨트롤러 알림으로 반영한다. */
  onRankingLikePress(key: RankingKey, postId: string): void {
    if (!this.isMember) {
      this.deps.toast.show(t('home.guest.like'));
      return;
    }
    const post = this.findPost(key, postId);
    if (post) {
      this.deps.likes.toggle({ postId, likeCount: post.likeCount, isLiked: post.isLiked });
    }
  }

  onBannerPress(bannerId: string): void {
    const feed = this.deps.bannerFeed.getSnapshot();
    if (feed.status !== 'ready') return;
    const banner = feed.banners.find((b) => b.id === bannerId);
    if (banner) this.deps.navigator.openBanner({ id: banner.id, webViewUrl: banner.webViewUrl });
  }

  /** 계정 전환·로그아웃: 상태와 진행 중 요청을 비운다. 이전 계정 요청의 늦은 응답은 무시한다. */
  clearAll(): void {
    this.invalidate();
    this.resetContent(todayKst(this.deps.clock));
    this.deps.bannerFeed.reset();
  }

  /** 홈이 소유한 하위 ViewModel(배너 목록)도 함께 정리한다. */
  override dispose(): void {
    this.onHidden();
    this.deps.bannerFeed.dispose();
    super.dispose();
  }

  // ---- 불러오기 ----

  /** 화면에 보이는 채로 모든 섹션을 조용히 갱신한다(진입·복귀). 새로고침이 진행 중이면 그것이 대신한다. */
  private quietReload(): Promise<void> {
    this.ensureCurrentDay();
    if (this.refreshInFlight) return this.refreshInFlight;
    return this.reload(this.beginRequests()).then(() => undefined);
  }

  private onVisibility(state: 'foreground' | 'background'): void {
    if (!this.shown) return;
    if (state === 'background') {
      this.stopAiPoller();
      return;
    }
    void this.quietReload();
  }

  /** 모든 섹션을 병렬로 요청한다. 내용이 있던 섹션의 실패만 돌려준다. */
  private async reload(ctx: RequestContext): Promise<Failure[]> {
    const results = await Promise.all([
      this.loadTodayGroup(ctx),
      this.loadYesterday(ctx),
      this.loadHero(ctx),
      this.loadWeekly(ctx),
      this.loadBanners(),
      this.loadUnread(ctx),
    ]);
    return results.flat();
  }

  private async loadTodayGroup(
    ctx: RequestContext,
    options: { topicSettled?: boolean } = {},
  ): Promise<Failure[]> {
    const date = this.getSnapshot().todayDate;
    const outcome = await this.attempt(ctx, (signal) => this.deps.topics.findByDate(date, signal));
    if (outcome.kind === 'cancelled') return [];
    if (outcome.kind === 'error') {
      const failures: Failure[] = [];
      const state = this.getSnapshot();
      if (state.topic.status === 'ready') failures.push(this.failureOf('topic', outcome.error));
      else this.setState((s) => ({ ...s, topic: { status: 'error' } }));
      if (state.popular.status !== 'ready') {
        this.setState((s) => ({ ...s, popular: { status: 'error' } }));
      }
      return failures;
    }
    const topic = outcome.value;
    if (!options.topicSettled) this.setState((s) => ({ ...s, topic: { status: 'ready', topic } }));
    return this.loadRanking(ctx, 'popular', topic);
  }

  private async loadYesterday(ctx: RequestContext): Promise<Failure[]> {
    const date = this.getSnapshot().yesterdayDate;
    const outcome = await this.attempt(ctx, (signal) => this.deps.topics.findByDate(date, signal));
    if (outcome.kind === 'cancelled') return [];
    if (outcome.kind === 'error') {
      if (this.getSnapshot().yesterday.status === 'ready') {
        return [this.failureOf('yesterday', outcome.error)];
      }
      this.setState((s) => ({ ...s, yesterday: { status: 'error' } }));
      return [];
    }
    return this.loadRanking(ctx, 'yesterday', outcome.value);
  }

  /** 주제의 날짜로 인기순 목록을 받아 앞 5장을 담는다. 주제가 없거나(404) 사진이 없으면 빈 ready. */
  private async loadRanking(
    ctx: RequestContext,
    key: RankingKey,
    topic: Topic | null,
  ): Promise<Failure[]> {
    if (topic === null) {
      this.setRanking(key, { status: 'ready', posts: [] });
      return [];
    }
    const outcome = await this.attempt(ctx, (signal) =>
      this.deps.posts.list({ topicDate: topic.topicDate, sort: 'popular', signal }),
    );
    if (outcome.kind === 'cancelled') return [];
    if (outcome.kind === 'ok') {
      const posts = this.withLatestLikes(outcome.value.posts).slice(0, RANKING_LIMIT);
      this.setRanking(key, { status: 'ready', posts });
      return [];
    }
    if (isHttp(outcome.error, 404)) {
      this.setRanking(key, { status: 'ready', posts: [] });
      return [];
    }
    if (this.getSnapshot()[key].status === 'ready') return [this.failureOf(key, outcome.error)];
    this.setRanking(key, { status: 'error' });
    return [];
  }

  private async loadHero(ctx: RequestContext): Promise<Failure[]> {
    if (!this.isMember) {
      this.setHero({ kind: 'empty', banned: false }, null);
      return [];
    }
    const outcome = await this.attempt(ctx, (signal) => this.deps.posts.getToday(signal));
    if (outcome.kind === 'cancelled') return [];
    if (outcome.kind === 'ok') {
      const today = outcome.value;
      if (!today.isPosted) this.setHero({ kind: 'empty', banned: false }, today.topicDate);
      else if (today.moderationStatus === 'VALIDATING') {
        this.setHero({ kind: 'processing' }, today.topicDate);
      } else {
        this.setHero(
          {
            kind: 'photo',
            postId: today.postId,
            pending: today.moderationStatus === 'PENDING',
            thumbnailUrl: null,
          },
          today.topicDate,
        );
      }
      return [];
    }
    if (isHttp(outcome.error, 404)) this.setHero({ kind: 'no-open-topic' }, null);
    else if (isHttp(outcome.error, 403)) this.setHero({ kind: 'empty', banned: true }, null);
    else if (this.heroBase !== null && this.heroBase.kind !== 'error') {
      return [this.failureOf('hero', outcome.error)];
    } else this.setHero({ kind: 'error' }, null);
    return [];
  }

  private async loadWeekly(ctx: RequestContext): Promise<Failure[]> {
    const days = weekOf(this.getSnapshot().todayDate);
    if (!this.isMember) {
      this.setWeekly(days, []);
      return [];
    }
    const months = monthsSpanned(days);
    const outcome = await this.attempt(ctx, (signal) =>
      Promise.all(months.map((m) => this.deps.posts.getCalendar(m.year, m.month, signal))),
    );
    if (outcome.kind === 'cancelled') return [];
    if (outcome.kind === 'ok') {
      const entries = outcome.value.flatMap((month) => month.posts);
      this.calendarEntries = entries;
      this.setWeekly(days, entries);
      this.publishHero();
      return [];
    }
    if (this.getSnapshot().weekly.status === 'ready') {
      return [this.failureOf('weekly', outcome.error)];
    }
    this.setState((s) => ({ ...s, weekly: { status: 'error' } }));
    return [];
  }

  /** 첫 로드·복귀는 `load`(로딩 중이면 이어받음), 이미 목록이 있거나 실패 상태면 `refresh`(화면을 비우지 않음). */
  private async loadBanners(): Promise<Failure[]> {
    const feed = this.deps.bannerFeed;
    if (feed.getSnapshot().status === 'loading') {
      await feed.load();
      return [];
    }
    const hadContent = feed.getSnapshot().status === 'ready';
    const failure = await feed.refresh();
    return hadContent && failure ? [{ section: 'banner', network: failure.network }] : [];
  }

  /** 미읽음은 조용히: 실패해도 점은 직전 값 그대로, 토스트도 없다. */
  private async loadUnread(ctx: RequestContext): Promise<Failure[]> {
    if (!this.isMember) return [];
    const outcome = await this.attempt(ctx, (signal) => this.deps.notifications.hasUnread(signal));
    if (outcome.kind === 'ok') this.setState((s) => ({ ...s, hasUnread: outcome.value }));
    return [];
  }

  private async attempt<T>(
    ctx: RequestContext,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<Outcome<T>> {
    try {
      const value = await run(ctx.signal);
      return ctx.token === this.generation ? { kind: 'ok', value } : { kind: 'cancelled' };
    } catch (error) {
      if (ctx.token !== this.generation || error instanceof CancelledError) {
        return { kind: 'cancelled' };
      }
      return { kind: 'error', error };
    }
  }

  // ---- 세대·날짜 ----

  /** 진행 중 요청을 모두 취소하고 그 응답을 낡은 것으로 만든다. */
  private invalidate(): void {
    this.generation += 1;
    this.controller.abort();
    this.controller = new AbortController();
    this.refreshInFlight = null;
  }

  /** 새 요청 한 세트를 시작한다(이전 세트는 취소). */
  private beginRequests(): RequestContext {
    this.invalidate();
    return this.currentContext();
  }

  /** 세트를 새로 만들지 않고 지금 세대에 얹는 부분 재시도·푸시용. */
  private currentContext(): RequestContext {
    return { token: this.generation, signal: this.controller.signal };
  }

  /** KST 날짜가 마지막으로 불러온 날짜와 다르면 이전 날짜의 내용을 비우고 새 날짜 기준으로 시작한다. */
  private ensureCurrentDay(): void {
    const today = todayKst(this.deps.clock);
    if (today.equals(this.getSnapshot().todayDate)) return;
    this.invalidate();
    // 같은 사용자의 날짜 변경이므로 미읽음 점과 스크롤 토큰은 유지한다(계정 전환은 clearAll이 모두 비운다).
    const { hasUnread, scrollToTopToken } = this.getSnapshot();
    this.resetContent(today);
    this.setState((s) => ({ ...s, hasUnread, scrollToTopToken }));
  }

  /** 상태와 부수 기록을 초기(loading)로 되돌린다. */
  private resetContent(today: KstDate): void {
    this.heroBase = null;
    this.heroTopicDate = null;
    this.calendarEntries = [];
    this.stopAiPoller();
    this.setState(initialHomeState(today, today.plusDays(-1)));
  }

  // ---- 상태 반영 ----

  private setRanking(key: RankingKey, section: RankingSection): void {
    this.setState((s) => ({ ...s, [key]: section }));
  }

  private setHero(base: HeroState, topicDate: KstDate | null): void {
    this.heroBase = base;
    this.heroTopicDate = topicDate;
    this.publishHero();
  }

  /** 히어로 기본 상태에 달력의 썸네일을 입히고, AI 카드 대상과 폴러를 맞춘다. */
  private publishHero(): void {
    const base = this.heroBase;
    if (base === null) return;
    const hero: HeroState =
      base.kind === 'photo' ? { ...base, thumbnailUrl: this.thumbnailFor(base.postId) } : base;
    const aiCardPostId =
      base.kind === 'photo' &&
      !base.pending &&
      this.heroTopicDate?.equals(this.getSnapshot().todayDate)
        ? base.postId
        : null;
    this.setState((s) => ({ ...s, hero, aiCardPostId }));
    this.syncAiPoller(aiCardPostId);
  }

  private thumbnailFor(postId: string): string | null {
    return this.calendarEntries.find((e) => e.postId === postId)?.thumbnailImageUrl ?? null;
  }

  private setWeekly(days: readonly KstDate[], entries: readonly CalendarEntry[]): void {
    const cells = days.map((date) => ({
      date,
      entry: entries.find((e) => e.topicDate.equals(date)) ?? null,
    }));
    const count = cells.filter((c) => c.entry !== null).length;
    this.setState((s) => ({ ...s, weekly: { status: 'ready', days: cells, count } }));
  }

  // ---- AI 폴러 ----

  /** 카드 대상 게시물이 있고 홈이 보일 때만 시작, 대상이 사라지면 멈춘다. 같은 게시물은 다시 시작하지 않는다. */
  private syncAiPoller(postId: string | null): void {
    if (postId === null) {
      this.stopAiPoller();
      return;
    }
    if (!this.shown || this.polledPostId === postId) return;
    this.polledPostId = postId;
    this.deps.aiReview.start(postId);
  }

  private stopAiPoller(): void {
    if (this.polledPostId === null && this.shown) return;
    this.polledPostId = null;
    this.deps.aiReview.stop();
  }

  // ---- 좋아요 ----

  private onLikeChange(change: LikeChange): void {
    this.setState((s) => ({
      ...s,
      yesterday: patchRanking(s.yesterday, change),
      popular: patchRanking(s.popular, change),
    }));
  }

  /** 다른 화면에서 이미 바뀐 좋아요 값이 있으면 응답 위에 덮어 그린다(D-04). */
  private withLatestLikes(posts: readonly PostSummary[]): PostSummary[] {
    return posts.map((post) => {
      const latest = this.deps.likes.snapshot(post.id);
      return latest ? { ...post, likeCount: latest.likeCount, isLiked: latest.isLiked } : post;
    });
  }

  private findPost(key: RankingKey, postId: string): PostSummary | undefined {
    const section = this.getSnapshot()[key];
    return section.status === 'ready' ? section.posts.find((p) => p.id === postId) : undefined;
  }

  // ---- 실패 문구 ----

  private failureOf(section: SectionKey, error: unknown): Failure {
    return { section, network: error instanceof NetworkError };
  }

  private failureMessage(failure: Failure): string {
    if (failure.network) return t('common.error.network');
    switch (failure.section) {
      case 'topic':
        return t('home.topic.error');
      case 'hero':
        return t('home.hero.error');
      case 'weekly':
        return t('home.weekly.error');
      case 'yesterday':
        return format(t('home.ranking.error'), { '섹션 제목': t('home.ranking.yesterday') });
      case 'popular':
        return format(t('home.ranking.error'), { '섹션 제목': t('home.ranking.today') });
      case 'banner':
        return t('home.banner.error');
    }
  }
}

function patchRanking(section: RankingSection, change: LikeChange): RankingSection {
  if (section.status !== 'ready') return section;
  if (change.kind === 'removed') {
    return { status: 'ready', posts: section.posts.filter((p) => p.id !== change.postId) };
  }
  const { snapshot } = change;
  return {
    status: 'ready',
    posts: section.posts.map((p) =>
      p.id === snapshot.postId
        ? { ...p, likeCount: snapshot.likeCount, isLiked: snapshot.isLiked }
        : p,
    ),
  };
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
