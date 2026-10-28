import { t } from '../../copy/ko';
import { ApiError, NetworkError, SessionChangedError } from '../../core/net/errors';
import { StaleGuard } from '../../core/state/StaleGuard';
import { ViewModel } from '../../core/state/ViewModel';
import type { UserCaches } from '../../core/auth/UserCaches';
import type { Clock } from '../../core/time/Clock';
import { kstToday } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import type { SessionMode } from '../boot/authGate';
import type { ExternalLinkOpener } from '../onboarding/ExternalLinkOpener';
import type { GuestGate } from '../shell/GuestGate';
import type { UploadEntry } from '../shell/UploadEntry';
import type { BannerFeed } from './BannerFeed';
import type { HomeNavigator } from './HomeNavigator';
import type { HomeRepository } from './HomeRepository';
import { isOpenableBannerUrl } from './bannerLink';
import { computeHomeDates } from './homeDates';
import type { HomeDates } from './homeDates';
import type { AiReviewStatus, CalendarEntry, HomeTopic, PostSummary, TodayPost } from './homeModels';

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
  /** 있으면 계정 전환·로그아웃 때 이 ViewModel을 처음 상태로 돌리도록 등록하고 dispose에서 뺀다. */
  userCaches?: UserCaches;
}

/** 랭킹에 담는 최대 개수(REQ-HOME-027). */
const RANKING_LIMIT = 5;

/** 새로고침 실패 토스트가 고르는 순서(화면 위에서 아래). */
type FailureSection = 'topic' | 'hero' | 'weekly' | 'yesterday' | 'popular' | 'banners';
const FAILURE_ORDER: readonly FailureSection[] = ['topic', 'hero', 'weekly', 'yesterday', 'popular', 'banners'];
interface Failure {
  section: FailureSection;
  network: boolean;
}

/** 섹션별로 독립된 요청 묶음. 같은 섹션의 새 요청은 이전 요청의 응답을 버린다. */
type LoadKey = 'topic' | 'yesterday' | 'hero' | 'weekly' | 'unread';
const LOAD_KEYS: readonly LoadKey[] = ['topic', 'yesterday', 'hero', 'weekly', 'unread'];

interface Pass {
  signal: AbortSignal;
  isCurrent(): boolean;
}

const isCancel = (error: unknown): boolean => (error instanceof Error && error.name === 'AbortError') || error instanceof SessionChangedError;

function failureCopy(failure: Failure): string {
  if (failure.network) return t('common.error.network');
  switch (failure.section) {
    case 'topic':
      return t('home.topic.error');
    case 'hero':
      return t('home.hero.error');
    case 'weekly':
      return t('home.weekly.error');
    case 'yesterday':
      return t('home.ranking.error', { '섹션 제목': t('home.ranking.yesterday-title') });
    case 'popular':
      return t('home.ranking.error', { '섹션 제목': t('home.ranking.today-title') });
    case 'banners':
      return t('home.banner.error');
  }
}

const emptyWeek = (dates: HomeDates): WeeklySection => ({ status: 'ready', days: dates.week.map((date) => ({ date, entry: null })), count: 0 });

/**
 * 홈 탭 로직(화면은 그리기만). 화면이 마운트될 때마다 새로 만든다(홈 탭은 선택할 때마다 새로 보인다).
 * 섹션은 병렬로 독립 로드한다. 게스트는 /posts/today, /posts/calendar, 미읽음, AI를 부르지 않는다.
 */
export class HomeViewModel extends ViewModel<HomeState> {
  private readonly guards: Record<LoadKey, StaleGuard> = {
    topic: new StaleGuard(),
    yesterday: new StaleGuard(),
    hero: new StaleGuard(),
    weekly: new StaleGuard(),
    unread: new StaleGuard(),
  };
  private readonly controllers: Record<LoadKey, AbortController | null> = { topic: null, yesterday: null, hero: null, weekly: null, unread: null };
  /** 전체 요청 세트 번호. 새 세트나 화면 이탈이 올리면 앞선 세트는 마무리(refreshing 해제, 토스트)를 하지 않는다. */
  private runId = 0;
  private refreshPromise: Promise<void> | null = null;
  private hidden = false;
  private gone = false;
  private aiRequestInFlight = false;
  /** 마지막으로 받은 /posts/today. 히어로는 이 값과 이번 주 기록(썸네일)에서 만든다. */
  private today: TodayPost | null = null;
  private readonly unregisterCache: (() => void) | undefined;

  constructor(protected readonly deps: HomeViewModelDeps) {
    super(HomeViewModel.initialState(deps));
    this.unregisterCache = deps.userCaches?.register({ clear: () => this.resetForAccountChange() });
  }

  /** ISSUE 배너 목록(화면이 구독한다). */
  get banners(): BannerFeed {
    return this.deps.banners;
  }

  /** 배너 가로 목록에서 마지막으로 보이는 카드의 인덱스가 바뀜(다음 페이지 선읽기). */
  onBannerLastVisibleIndexChanged(index: number): Promise<void> {
    return this.deps.banners.onLastVisibleIndexChanged(index);
  }

  private static initialState(deps: HomeViewModelDeps): HomeState {
    const dates = computeHomeDates(kstToday(deps.clock));
    const guest = deps.mode === 'guest';
    return {
      mode: deps.mode,
      todayDate: dates.today,
      yesterdayDate: dates.yesterday,
      topic: { status: 'loading' },
      hero: guest ? { kind: 'empty', banned: false } : { kind: 'loading' },
      weekly: guest ? emptyWeek(dates) : { status: 'loading' },
      yesterday: { status: 'loading' },
      popular: { status: 'loading' },
      ai: { kind: 'hidden' },
      hasUnread: false,
      refreshing: false,
    };
  }

  private get isMember(): boolean {
    return this.deps.mode === 'member';
  }

  // ---------------------------------------------------------------- 수명

  /** 홈이 보일 때(마운트, 문서 가시성 복귀, 다른 탭에서 돌아옴). 처음이면 전체 로드(섹션 loading), 이미 불러온 뒤면 화면을 비우지 않고 조용히 전체 재요청(REQ-HOME-040). KST 날짜가 바뀌었으면 비우고 새 날짜로 전체 재로드(REQ-HOME-041). */
  async onShown(): Promise<void> {
    this.hidden = false;
    this.startDateIfChanged();
    this.runId += 1;
    this.refreshPromise = null;
    if (this.state.refreshing) this.setState({ refreshing: false });
    await this.loadEverything();
  }

  /** 홈이 보이지 않게 됨(문서 숨김, 언마운트). 진행 중 요청을 취소하고 이후 실패 토스트를 띄우지 않는다. */
  onHidden(): void {
    this.hidden = true;
    this.cancelAll();
    this.runId += 1;
    this.refreshPromise = null;
    this.deps.banners.cancelPending();
    if (this.state.refreshing) this.setState({ refreshing: false });
  }

  /** 새로고침 버튼(또는 당기기). 콘텐츠 유지 + refreshing + 전체 재요청, 진행 중이면 무시, 실패는 토스트 최대 1건. */
  refresh(): Promise<void> {
    const dateChanged = kstToday(this.deps.clock) !== this.state.todayDate;
    if (this.refreshPromise && !dateChanged) return this.refreshPromise;
    this.startDateIfChanged();
    const run = ++this.runId;
    this.setState({ refreshing: true });
    const promise = this.loadEverything().then((failures) => {
      if (this.gone || run !== this.runId) return;
      this.refreshPromise = null;
      this.setState({ refreshing: false });
      const first = FAILURE_ORDER.map((section) => failures.find((f) => f.section === section)).find((f) => f !== undefined);
      if (first && !this.hidden) this.deps.toast.show(failureCopy(first));
    });
    this.refreshPromise = promise;
    return promise;
  }

  /** 알림 점만 다시 조회(푸시 수신 이벤트 자리, Web은 푸시가 없어 알림함에서 돌아올 때 onShown이 대신한다). 실패는 조용히. */
  async refreshUnread(): Promise<void> {
    if (!this.isMember) return;
    await this.loadUnread();
  }

  /** 계정 전환·로그아웃: 진행 중 요청을 버리고 처음 상태로 돌린다(UserCaches). */
  resetForAccountChange(): void {
    this.cancelAll();
    this.runId += 1;
    this.refreshPromise = null;
    this.today = null;
    this.deps.banners.reset();
    this.replaceState(HomeViewModel.initialState(this.deps));
  }

  override dispose(): void {
    this.gone = true;
    this.unregisterCache?.();
    this.cancelAll();
    this.deps.banners.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- 다시 시도

  retryTopic(): Promise<void> {
    const dates = this.currentDates();
    this.setState({ topic: { status: 'loading' }, popular: { status: 'loading' } });
    return this.loadTopicAndPopular(dates).then(() => undefined);
  }

  async retryHero(): Promise<void> {
    if (!this.isMember) return;
    this.today = null;
    this.setState({ hero: { kind: 'loading' }, ai: { kind: 'hidden' } });
    await this.loadHero(this.currentDates());
  }

  async retryWeekly(): Promise<void> {
    if (!this.isMember) return;
    this.setState({ weekly: { status: 'loading' } });
    await this.loadWeekly(this.currentDates());
  }

  /** 그 섹션만 다시 부른다. popular는 주제가 이미 있으면 주제를 다시 받지 않는다. */
  async retryRanking(key: RankingKey): Promise<void> {
    const dates = this.currentDates();
    if (key === 'yesterday') {
      this.setState({ yesterday: { status: 'loading' } });
      await this.loadYesterday(dates);
      return;
    }
    const topic = this.state.topic;
    if (topic.status === 'ready' && topic.topic) {
      this.setState({ popular: { status: 'loading' } });
      await this.loadPopularFor(topic.topic, this.begin('topic'));
      return;
    }
    await this.retryTopic();
  }

  async retryBanners(): Promise<void> {
    await this.deps.banners.load();
  }

  // ---------------------------------------------------------------- 동작

  /** 히어로 탭. empty: 게스트면 토스트, 정지(banned)면 D-08 토스트, 아니면 uploadEntry.start(). 그 밖의 상태는 아무 일도 없다(Photo는 이동 없음). */
  onHeroPress(): void {
    const hero = this.state.hero;
    if (hero.kind !== 'empty') return;
    if (!this.deps.guestGate.requireMember(this.deps.mode, 'upload')) return;
    if (hero.banned) {
      this.deps.toast.show(t('home.hero.banned'));
      return;
    }
    this.deps.uploadEntry.start();
  }

  /** 알림 벨. 게스트는 토스트, 회원은 navigator.openNotifications(). */
  onNotificationPress(): void {
    if (!this.deps.guestGate.requireMember(this.deps.mode, 'notification')) return;
    this.deps.navigator.openNotifications();
  }

  /** 기록이 있는 칸이면 navigator.openRecord(date), 없으면 아무 일도 없다. */
  onWeekDayPress(date: DateString): void {
    const weekly = this.state.weekly;
    if (weekly.status !== 'ready') return;
    if (!weekly.days.some((day) => day.date === date && day.entry)) return;
    this.deps.navigator.openRecord(date);
  }

  /** 보러가기 → navigator.openRecord(null). 게스트는 기록 탭 제한 토스트(임시). */
  onWeeklyMorePress(): void {
    if (!this.deps.guestGate.requireMember(this.deps.mode, 'record')) return;
    this.deps.navigator.openRecord(null);
  }

  /** 게스트는 feed 토스트, 회원은 navigator.openPostDetail({ postId, seed: 목록 항목 }). */
  onRankingItemPress(key: RankingKey, postId: string): void {
    const section = this.state[key];
    if (section.status !== 'ready') return;
    const seed = section.posts.find((post) => post.id === postId);
    if (!seed) return;
    if (!this.deps.guestGate.requireMember(this.deps.mode, 'feed')) return;
    this.deps.navigator.openPostDetail({ postId, seed });
  }

  /** 더 보기 → navigator.openDisplayPopular(해당 섹션 날짜: 어제 또는 오늘). */
  onRankingMorePress(key: RankingKey): void {
    this.deps.navigator.openDisplayPopular(key === 'yesterday' ? this.state.yesterdayDate : this.state.todayDate);
  }

  /** 배너 → https만 externalLinkOpener.open(새 탭). 그 밖은 차단 토스트, opener 실패는 열기 실패 토스트. */
  onBannerPress(bannerId: string): void {
    const feed = this.deps.banners.state;
    if (feed.status !== 'ready') return;
    const banner = feed.banners.find((b) => b.id === bannerId);
    if (!banner) return;
    if (!isOpenableBannerUrl(banner.webViewUrl)) {
      this.deps.toast.show(t('banner.web.link-unavailable'));
      return;
    }
    let opened: boolean;
    try {
      opened = this.deps.externalLinkOpener.open(banner.webViewUrl);
    } catch {
      opened = false;
    }
    if (!opened) this.deps.toast.show(t('banner.web.open-failed'));
  }

  /** AI 카드 요청/재요청 버튼 → POST 1회(요청 중 연타 무시). 성공하면 PROCESSING. */
  async onAiRequestPress(): Promise<void> {
    const card = this.state.ai;
    if (card.kind !== 'ready' || card.requesting || this.aiRequestInFlight) return;
    if (!(card.status === 'NONE' || (card.status === 'FAILED' && card.canRequestAgain))) return;
    this.aiRequestInFlight = true;
    this.setState({ ai: { ...card, requesting: true } });
    try {
      const result = await this.deps.repository.requestAiReview(card.postId);
      if (this.gone) return;
      const current = this.state.ai;
      if (current.kind === 'ready' && current.postId === card.postId) {
        this.setState({ ai: { ...current, status: result.status, canRequestAgain: result.canRequestAgain, requesting: false } });
      }
    } catch (error) {
      if (this.gone) return;
      const current = this.state.ai;
      if (current.kind === 'ready' && current.postId === card.postId) this.setState({ ai: { ...current, requesting: false } });
      if (isCancel(error)) return;
      if (error instanceof ApiError && error.status === 403) this.deps.toast.show(t('ai.error.banned'));
      else if (error instanceof NetworkError) this.deps.toast.show(t('ai.error.network'));
      else this.deps.toast.show(t('common.error.generic'));
    } finally {
      this.aiRequestInFlight = false;
    }
  }

  /** COMPLETED의 자세히 보기 → navigator.openAiReview(postId). */
  onAiDetailPress(): void {
    const card = this.state.ai;
    if (card.kind !== 'ready' || card.status !== 'COMPLETED') return;
    this.deps.navigator.openAiReview(card.postId);
  }

  // ---------------------------------------------------------------- 로드 공통

  private currentDates(): HomeDates {
    return computeHomeDates(this.state.todayDate);
  }

  /** KST 날짜가 바뀌었으면 이전 날짜 내용을 한 번에 비운다(REQ-HOME-041). */
  private startDateIfChanged(): void {
    const today = kstToday(this.deps.clock);
    if (today === this.state.todayDate) return;
    this.cancelAll();
    this.deps.banners.cancelPending();
    this.today = null;
    const dates = computeHomeDates(today);
    this.setState({
      todayDate: dates.today,
      yesterdayDate: dates.yesterday,
      topic: { status: 'loading' },
      hero: this.isMember ? { kind: 'loading' } : { kind: 'empty', banned: false },
      weekly: this.isMember ? { status: 'loading' } : emptyWeek(dates),
      yesterday: { status: 'loading' },
      popular: { status: 'loading' },
      ai: { kind: 'hidden' },
    });
  }

  private begin(key: LoadKey): Pass {
    this.controllers[key]?.abort();
    const controller = new AbortController();
    this.controllers[key] = controller;
    const ticket = this.guards[key].begin();
    return { signal: controller.signal, isCurrent: () => !this.gone && ticket.isCurrent() };
  }

  private cancelAll(): void {
    for (const key of LOAD_KEYS) {
      this.controllers[key]?.abort();
      this.controllers[key] = null;
      this.guards[key].invalidate();
    }
  }

  /** 모든 섹션을 동시에 시작해 서로 기다리지 않고 끝낸다. 실패한 섹션 목록을 돌려준다. */
  private async loadEverything(): Promise<Failure[]> {
    const dates = this.currentDates();
    const results = await Promise.all([
      this.loadTopicAndPopular(dates),
      this.loadYesterday(dates),
      this.loadHero(dates),
      this.loadWeekly(dates),
      this.loadUnread(),
      this.loadBanners(),
    ]);
    return results.flat();
  }

  private failureOf(section: FailureSection, error: unknown): Failure {
    return { section, network: error instanceof NetworkError };
  }

  // ---------------------------------------------------------------- 섹션

  /** 오늘 주제 머리글과 오늘 인기. 주제가 없으면(404) 인기는 요청 없이 빈 목록. */
  private async loadTopicAndPopular(dates: HomeDates): Promise<Failure[]> {
    const pass = this.begin('topic');
    let topic: HomeTopic | null;
    try {
      topic = await this.deps.repository.fetchTopic(dates.today, pass.signal);
    } catch (error) {
      if (!pass.isCurrent() || isCancel(error)) return [];
      // 주제가 없으면 인기도 의미가 없다: 이미 보이는 내용은 유지하고 없으면 오류.
      if (this.state.topic.status !== 'ready') this.setState({ topic: { status: 'error' } });
      if (this.state.popular.status !== 'ready') this.setState({ popular: { status: 'error' } });
      return [this.failureOf('topic', error)];
    }
    if (!pass.isCurrent()) return [];
    this.setState({ topic: { status: 'ready', topic } });
    if (!topic) {
      this.setState({ popular: { status: 'ready', posts: [] } });
      return [];
    }
    return this.loadPopularFor(topic, pass);
  }

  private async loadPopularFor(topic: HomeTopic, pass: Pass): Promise<Failure[]> {
    try {
      const posts = await this.deps.repository.fetchPopularPosts(topic.topicDate, pass.signal);
      if (!pass.isCurrent()) return [];
      this.setState({ popular: { status: 'ready', posts: posts.slice(0, RANKING_LIMIT) } });
      return [];
    } catch (error) {
      if (!pass.isCurrent() || isCancel(error)) return [];
      if (this.state.popular.status !== 'ready') this.setState({ popular: { status: 'error' } });
      return [this.failureOf('popular', error)];
    }
  }

  private async loadYesterday(dates: HomeDates): Promise<Failure[]> {
    const pass = this.begin('yesterday');
    try {
      const topic = await this.deps.repository.fetchTopic(dates.yesterday, pass.signal);
      const posts = topic ? await this.deps.repository.fetchPopularPosts(topic.topicDate, pass.signal) : [];
      if (!pass.isCurrent()) return [];
      this.setState({ yesterday: { status: 'ready', posts: posts.slice(0, RANKING_LIMIT) } });
      return [];
    } catch (error) {
      if (!pass.isCurrent() || isCancel(error)) return [];
      if (this.state.yesterday.status !== 'ready') this.setState({ yesterday: { status: 'error' } });
      return [this.failureOf('yesterday', error)];
    }
  }

  /** 히어로(/posts/today)와, 승인된 오늘 사진이면 AI 카드. 게스트는 요청 없이 empty. */
  private async loadHero(dates: HomeDates): Promise<Failure[]> {
    if (!this.isMember) return [];
    const pass = this.begin('hero');
    let today: TodayPost;
    try {
      today = await this.deps.repository.fetchTodayPost(pass.signal);
    } catch (error) {
      if (!pass.isCurrent() || isCancel(error)) return [];
      const kind = this.state.hero.kind;
      if (kind === 'loading' || kind === 'error') this.setState({ hero: { kind: 'error' } });
      return [this.failureOf('hero', error)];
    }
    if (!pass.isCurrent()) return [];
    this.today = today;
    this.publishHero();
    if (today.kind === 'posted' && today.moderationStatus === 'APPROVED' && today.topicDate === dates.today) {
      await this.loadAiCard(today.postId, pass);
    } else {
      this.setState({ ai: { kind: 'hidden' } });
    }
    return [];
  }

  private async loadAiCard(postId: string, pass: Pass): Promise<void> {
    try {
      const review = await this.deps.repository.fetchAiReview(postId, pass.signal);
      if (!pass.isCurrent()) return;
      if (!review) {
        this.setState({ ai: { kind: 'hidden' } });
        return;
      }
      const current = this.state.ai;
      const requesting = current.kind === 'ready' && current.postId === postId && current.requesting;
      this.setState({ ai: { kind: 'ready', postId, status: review.status, canRequestAgain: review.canRequestAgain, requesting } });
    } catch (error) {
      if (!pass.isCurrent() || isCancel(error)) return;
      const current = this.state.ai;
      // 카드만 숨길 뿐 다른 섹션·토스트에는 영향이 없다. 같은 사진의 기존 카드는 유지한다.
      if (!(current.kind === 'ready' && current.postId === postId)) this.setState({ ai: { kind: 'hidden' } });
    }
  }

  /** 마지막 /posts/today와 이번 주 기록에서 히어로를 만든다. 썸네일은 이번 주 기록의 같은 postId에서만 얻는다. */
  private publishHero(): void {
    const today = this.today;
    if (!today) return;
    switch (today.kind) {
      case 'no-open-topic':
        this.setState({ hero: { kind: 'no-open-topic' } });
        return;
      case 'banned':
        this.setState({ hero: { kind: 'empty', banned: true } });
        return;
      case 'not-posted':
        this.setState({ hero: { kind: 'empty', banned: false } });
        return;
      case 'posted': {
        if (today.moderationStatus === 'VALIDATING') {
          this.setState({ hero: { kind: 'processing' } });
          return;
        }
        const weekly = this.state.weekly;
        const entry = weekly.status === 'ready' ? weekly.days.find((day) => day.entry?.postId === today.postId)?.entry : undefined;
        this.setState({ hero: { kind: 'photo', postId: today.postId, pending: today.moderationStatus === 'PENDING', thumbnailUrl: entry?.thumbnailImageUrl ?? null } });
        return;
      }
    }
  }

  /** 이번 주 기록. 주가 걸친 달마다 요청해 합치고, 한 달이라도 실패하면 부분 표시 없이 실패로 본다. */
  private async loadWeekly(dates: HomeDates): Promise<Failure[]> {
    if (!this.isMember) return [];
    const pass = this.begin('weekly');
    try {
      const months = await Promise.all(dates.months.map(({ year, month }) => this.deps.repository.fetchCalendar(year, month, pass.signal)));
      if (!pass.isCurrent()) return [];
      const byDate = new Map<DateString, CalendarEntry>();
      for (const entry of months.flat()) byDate.set(entry.topicDate, entry);
      const days: WeekDay[] = dates.week.map((date) => ({ date, entry: byDate.get(date) ?? null }));
      this.setState({ weekly: { status: 'ready', days, count: days.filter((day) => day.entry).length } });
      this.publishHero();
      return [];
    } catch (error) {
      if (!pass.isCurrent() || isCancel(error)) return [];
      if (this.state.weekly.status !== 'ready') this.setState({ weekly: { status: 'error' } });
      return [this.failureOf('weekly', error)];
    }
  }

  private async loadUnread(): Promise<Failure[]> {
    if (!this.isMember) return [];
    const pass = this.begin('unread');
    try {
      const hasUnread = await this.deps.repository.fetchUnreadStatus(pass.signal);
      if (pass.isCurrent()) this.setState({ hasUnread });
    } catch {
      // 실패하면 직전 값을 유지한다(D-10). 토스트·오류 UI 없음.
    }
    return [];
  }

  private async loadBanners(): Promise<Failure[]> {
    const feed = this.deps.banners;
    if (feed.state.status === 'loading') {
      await feed.load();
      return [];
    }
    const failure = await feed.refresh();
    return failure ? [{ section: 'banners', network: failure.network }] : [];
  }
}
