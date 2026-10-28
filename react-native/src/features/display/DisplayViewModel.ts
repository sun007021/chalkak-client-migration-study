import { CancelledError, HttpError, NetworkError } from '../../core/http/ApiError';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import { todayKst } from '../../core/time/kst';
import { FIRST_TOPIC_KST_DATE } from '../../core/time/topicDateBounds';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { PostSort, PostSummary } from '../../data/post/PostModels';
import type { PostRepository } from '../../data/post/PostRepository';
import type { Topic } from '../../data/topic/Topic';
import type { TopicRepository } from '../../data/topic/TopicRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator, MainMode } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { LikeChange, LikeController } from '../like/LikeController';
import type { PostChange, PostChanges } from '../post/PostChanges';
import { clampToRange } from './displayDateRange';
import type { DisplayNavigator } from './DisplayNavigator';
import { END_THRESHOLD, FEATURED_COUNT, type DisplayState } from './DisplayState';

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
  /** 남은 401(AuthenticationRequiredError)일 때 로그인으로 보내는 통로(AuthErrorPolicy). */
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

/** (날짜, 정렬) 하나의 캐시. pages[i]는 i+1번째 페이지다. */
type Entry = {
  topic: Topic;
  pages: readonly (readonly PostSummary[])[];
  hasNext: boolean;
  /** 랜덤 정렬의 시드. 서버가 주지 않았으면 null(이어 붙일 수 없다). */
  seed: string | null;
};

/**
 * 어떤 일로 (날짜, 정렬)을 고르나.
 * - nav: 날짜 이동·첫 진입·다시 시도. 캐시가 없으면 로딩으로 비우고, 실패하면 직전 전시로 복원한다.
 * - sort: 정렬 변경. 캐시가 없으면 기존 사진을 유지한 채 refreshing.
 * - reval: 탭 재선택·복귀 재검증.
 */
type SelectKind = 'nav' | 'sort' | 'reval';

/** (날짜, 정렬) 캐시의 최대 개수. 넘으면 가장 오래 쓰지 않은 것부터 버린다. */
const CACHE_LIMIT = 20;

const keyOf = (date: KstDate, sort: PostSort): string => `${date.toString()}|${sort}`;

const modeOf = (date: KstDate, today: KstDate): DisplayState['mode'] =>
  date.equals(today) ? 'latest' : 'archive';

const featuredOf = (mode: DisplayState['mode'], photos: readonly PostSummary[]) =>
  mode === 'archive' ? photos.slice(0, FEATURED_COUNT) : [];

type Derived = 'navigationLocked' | 'canGoPrevious' | 'canGoNext';

/**
 * 전시 탭 상태. (날짜, 정렬)별 캐시, 세대 번호로 늦은 응답 폐기, 랜덤 시드 보관, 좋아요 revision 병합을 맡는다.
 * 계정 전환 때 비우도록 UserDataCache를 구현한다. 소유자(내비게이션)가 만들고 버린다.
 *
 * - 좋아요·게시물 변경 구독은 생성부터 dispose까지 유지한다(상세가 위에 있어 전시가 가려진 동안에도 반영해야 한다).
 * - 세대 번호(generation)는 날짜·정렬 선택, 이탈, 계정 전환 때 올라가고, 낡은 세대의 응답은 화면에 쓰지 않는다.
 *   다만 계정이 그대로면 낡은 응답도 (랜덤이 아닌) 캐시에는 남긴다.
 */
export class DisplayViewModel extends Observable<DisplayState> implements UserDataCache {
  private readonly cache = new Map<string, Entry>();
  /** 404(removed)로 목록에서 뺀 게시물. 늦은 응답이 되살리지 못하게 거른다. */
  private readonly removedIds = new Set<string>();
  /** 마지막으로 확정된(content·empty) 상태. 이동 실패 때 복원한다. */
  private lastGood: DisplayState | null = null;
  private generation = 0;
  private epoch = 0;
  private controller = new AbortController();
  private pending: { key: string; generation: number; promise: Promise<void> } | null = null;
  /** 게시물 변경(제목)이 일어난 순서. 요청을 보낸 뒤의 변경만 그 응답에 덧입힌다(좋아요 revision과 같은 방식). */
  private changeSeq = 0;
  private readonly titleChanges = new Map<string, { title: string | null; seq: number }>();
  private readonly authErrors: AuthErrorPolicy;
  private readonly stopLikes: () => void;
  private readonly stopChanges: () => void;

  constructor(private readonly deps: DisplayViewModelDeps) {
    super(initialState(todayKst(deps.clock), 'recent', 0));
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
    this.stopLikes = deps.likes.subscribe((change) => this.onLikeChange(change));
    this.stopChanges = deps.changes.subscribe((change) => this.onPostChange(change));
  }

  private get isMember(): boolean {
    return this.deps.mode === 'member';
  }

  /** 화면이 보인다: 처음이면 오늘 최신순 로드, 아니면 상한을 갱신하고 첫 페이지를 재검증한다(REQ-DISP-015, 030). */
  onShown(): Promise<void> {
    const s = this.getSnapshot();
    const hasContent = s.status === 'content' || s.status === 'empty';
    const today = todayKst(this.deps.clock);
    const target = this.targetOf(s.date, s.preferredSort, today);
    const pending = this.pending;
    if (pending && pending.generation === this.generation && pending.key === target.key) {
      // 다른 화면이 openDate로 이미 같은 전시를 불러오는 중이면 그것을 이어받는다.
      this.setState((cur) => this.withDerived({ ...cur, today }));
      return pending.promise;
    }
    return this.select(s.date, s.preferredSort, hasContent ? 'reval' : 'nav');
  }

  /** 화면이 안 보인다: 진행 중 요청을 취소한다(오류로 보이지 않음). */
  onHidden(): void {
    this.invalidate(true);
    this.setState((s) =>
      s.refreshing || s.paging ? this.withDerived({ ...s, refreshing: false, paging: false }) : s,
    );
  }

  /** 다른 화면이 날짜(와 정렬)를 지정해 연다(홈 랭킹 더보기, 기록, 업로드 성공). 지정 안 한 정렬은 최신순. */
  openDate(date: KstDate, sort?: PostSort): Promise<void> {
    const today = todayKst(this.deps.clock);
    return this.select(clampToRange(date, this.rangeOf(today)), sort ?? 'recent', 'nav', true);
  }

  goPrevious(): Promise<void> {
    const s = this.getSnapshot();
    if (s.navigationLocked || !s.canGoPrevious) return Promise.resolve();
    return this.select(s.date.plusDays(-1), s.preferredSort, 'nav');
  }

  goNext(): Promise<void> {
    const s = this.getSnapshot();
    if (s.navigationLocked || !s.canGoNext) return Promise.resolve();
    return this.select(s.date.plusDays(1), s.preferredSort, 'nav');
  }

  /** 날짜 선택 시트에서 고른 날짜(범위 밖이면 끝으로 맞춘다). 같은 날짜면 재요청하지 않는다. */
  pickDate(date: KstDate): Promise<void> {
    const s = this.getSnapshot();
    if (s.navigationLocked) return Promise.resolve();
    const picked = clampToRange(date, this.rangeOf(s.today));
    if (picked.equals(s.date)) return Promise.resolve();
    return this.select(picked, s.preferredSort, 'nav');
  }

  selectSort(sort: PostSort): Promise<void> {
    const s = this.getSnapshot();
    if (s.mode !== 'latest' || s.sort === sort) return Promise.resolve();
    return this.select(s.date, sort, 'sort', true);
  }

  /** 화면이 계산한 "보이는 마지막 항목 인덱스". 끝에서 세 번째 이내면 다음 페이지를 요청한다. */
  async onLastVisibleIndexChanged(index: number): Promise<void> {
    const s = this.getSnapshot();
    if (s.status !== 'content' || s.paging || s.refreshing || !s.hasNext) return;
    if (index < s.photos.length - 1 - END_THRESHOLD) return;
    const key = keyOf(s.date, s.sort);
    const entry = this.cache.get(key);
    if (!entry) return;
    // 랜덤인데 시드가 없으면 같은 목록을 이어 받을 수 없다(REQ-DISP-021).
    if (s.sort === 'random' && entry.seed === null) return;
    const { generation, epoch } = this;
    const since = this.deps.likes.revision();
    const titleSince = this.changeSeq;
    this.setState((cur) => ({ ...cur, paging: true }));
    try {
      const page = await this.deps.posts.list({
        topicDate: entry.topic.topicDate,
        sort: s.sort,
        page: entry.pages.length + 1,
        randomSeed: s.sort === 'random' ? (entry.seed ?? undefined) : undefined,
        signal: this.controller.signal,
      });
      if (generation !== this.generation || epoch !== this.epoch) return;
      const current = this.cache.get(key);
      if (current !== entry) {
        this.setState((cur) => ({ ...cur, paging: false }));
        return;
      }
      const next: Entry = {
        ...entry,
        pages: [...entry.pages, this.mergeLikes(page.posts, since, titleSince)],
        hasNext: page.hasNext,
      };
      this.cachePut(key, next);
      this.setState((cur) =>
        this.withDerived({ ...cur, ...this.contentOf(next, cur), paging: false }),
      );
    } catch (error) {
      if (generation !== this.generation || epoch !== this.epoch) return;
      this.setState((cur) => ({ ...cur, paging: false }));
      if (error instanceof CancelledError || this.authErrors.handle(error, generation)) return;
      this.deps.toast.show(this.failureMessage(error));
    }
  }

  /** 전시 탭 다시 누르기: 맨 위로 + 첫 페이지 재검증. */
  onTabReselected(): Promise<void> {
    const s = this.getSnapshot();
    if (s.status === 'error') return this.retry();
    this.setState((cur) => ({ ...cur, scrollToTopToken: cur.scrollToTopToken + 1 }));
    return this.select(s.date, s.preferredSort, 'reval');
  }

  /** 오류 화면의 "다시 시도". */
  retry(): Promise<void> {
    const s = this.getSnapshot();
    return this.select(s.date, s.preferredSort, 'nav');
  }

  onFeaturedPageChanged(page: number): void {
    this.setState((s) => (s.featuredPage === page ? s : { ...s, featuredPage: page }));
  }

  onPhotoPress(postId: string): void {
    if (!this.isMember) {
      this.deps.toast.show(t('guest.feed'));
      return;
    }
    const seed = this.getSnapshot().photos.find((p) => p.id === postId);
    if (seed) this.deps.navigator.openPostDetail({ postId, seed });
  }

  onLikePress(postId: string): void {
    if (!this.isMember) {
      this.deps.toast.show(t('guest.like'));
      return;
    }
    const post = this.getSnapshot().photos.find((p) => p.id === postId);
    if (post) {
      this.deps.likes.toggle({ postId, likeCount: post.likeCount, isLiked: post.isLiked });
    }
  }

  /** 계정 전환·로그아웃: 캐시·시드·진행 중 요청을 비운다. 고른 정렬(UI 설정)만 남긴다. */
  clearAll(): void {
    this.invalidate(true);
    this.epoch += 1;
    this.cache.clear();
    this.removedIds.clear();
    this.titleChanges.clear();
    this.lastGood = null;
    const s = this.getSnapshot();
    this.setState(initialState(todayKst(this.deps.clock), s.preferredSort, s.scrollToTopToken));
  }

  override dispose(): void {
    this.invalidate(true);
    this.stopLikes();
    this.stopChanges();
    super.dispose();
  }

  // ---- 선택·불러오기 ----

  /** 쓴 항목을 가장 최근으로 올린다. */
  private cacheGet(key: string): Entry | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry;
  }

  private cachePut(key: string, entry: Entry): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private rangeOf(today: KstDate) {
    return { min: FIRST_TOPIC_KST_DATE, max: today };
  }

  private targetOf(date: KstDate, sort: PostSort, today: KstDate) {
    const mode = modeOf(date, today);
    const effective: PostSort = mode === 'archive' ? 'popular' : sort;
    return { mode, sort: effective, key: keyOf(date, effective) };
  }

  /**
   * 진행 중 응답을 낡은 것으로 만든다. `abort`가 true(이탈·계정 전환·dispose)면 요청도 취소한다.
   * 새 선택으로 밀려난 요청은 취소하지 않는다: 끝까지 받아 캐시에 남겨 두면 그 (날짜, 정렬)을 다시 골랐을 때 즉시 보인다.
   */
  private invalidate(abort: boolean): void {
    this.generation += 1;
    if (abort) {
      this.controller.abort();
      this.controller = new AbortController();
    }
    this.pending = null;
  }

  private select(
    date: KstDate,
    requestedSort: PostSort,
    kind: SelectKind,
    explicitSort = false,
  ): Promise<void> {
    const today = todayKst(this.deps.clock);
    const target = this.targetOf(date, requestedSort, today);
    const prev = this.getSnapshot();
    // 오늘 모드에서 고른 정렬만 기억한다. 아카이브 이동은 기억한 정렬을 건드리지 않는다.
    // openDate처럼 정렬을 명시한 호출은 아카이브여도 새 기본값으로 삼는다.
    const preferredSort =
      target.mode === 'latest' || explicitSort ? requestedSort : prev.preferredSort;

    this.invalidate(false);
    const generation = this.generation;
    const epoch = this.epoch;
    const since = this.deps.likes.revision();
    const titleSince = this.changeSeq;
    const signal = this.controller.signal;
    const entry = this.cacheGet(target.key);

    const dateChanged = !date.equals(prev.date);
    const base: DisplayState = {
      ...prev,
      today,
      date,
      mode: target.mode,
      sort: target.sort,
      preferredSort,
      featuredPage: dateChanged ? 0 : prev.featuredPage,
      errorKind: null,
      paging: false,
    };
    if (entry) {
      this.setState(
        this.withDerived({ ...base, ...this.contentOf(entry, base), refreshing: true }),
      );
      this.lastGood = this.getSnapshot();
    } else if (kind === 'nav' || prev.photos.length === 0) {
      this.setState(
        this.withDerived({
          ...base,
          topic: null,
          status: 'loading',
          photos: [],
          featured: [],
          hasNext: false,
          refreshing: false,
        }),
      );
    } else {
      this.setState(
        this.withDerived({
          ...base,
          topic: dateChanged ? null : prev.topic,
          featured: featuredOf(target.mode, prev.photos),
          refreshing: true,
        }),
      );
    }

    const promise = this.load(
      { generation, epoch, signal, since, titleSince },
      date,
      target,
      entry,
    );
    this.pending = { key: target.key, generation, promise };
    return promise;
  }

  private async load(
    ctx: {
      generation: number;
      epoch: number;
      signal: AbortSignal;
      since: number;
      titleSince: number;
    },
    date: KstDate,
    target: { sort: PostSort; key: string },
    cached: Entry | undefined,
  ): Promise<void> {
    const stale = () => ctx.generation !== this.generation;
    try {
      let topic = cached?.topic;
      if (!topic) {
        const found = await this.deps.topics.findByDate(date, ctx.signal);
        if (stale()) return;
        if (found === null) {
          this.onTopicMissing();
          return;
        }
        topic = found;
      }
      const seed = target.sort === 'random' ? (cached?.seed ?? undefined) : undefined;
      const page = await this.deps.posts.list({
        topicDate: topic.topicDate,
        sort: target.sort,
        page: 1,
        randomSeed: seed,
        signal: ctx.signal,
      });
      const fresh = this.mergeLikes(page.posts, ctx.since, ctx.titleSince);
      const previous = this.cache.get(target.key);
      const newSeed = target.sort === 'random' ? (page.randomSeed ?? previous?.seed ?? null) : null;
      // 첫 페이지만 새로 받았을 때 같은 시드(랜덤)·같은 정렬에서 이미 받은 뒤쪽 페이지는 유지한다(REQ-DISP-027).
      const keepTail =
        previous !== undefined &&
        previous.pages.length > 1 &&
        (target.sort !== 'random' || previous.seed === newSeed);
      const entry: Entry = {
        topic,
        pages: keepTail ? [fresh, ...previous.pages.slice(1)] : [fresh],
        hasNext: keepTail ? previous.hasNext : page.hasNext,
        seed: newSeed,
      };
      if (stale()) {
        // 늦은 응답은 화면을 덮지 않고 캐시에만 남긴다. 랜덤은 시드가 버려진 뒤일 수 있어 남기지 않는다.
        if (ctx.epoch === this.epoch && target.sort !== 'random' && !this.cache.has(target.key)) {
          this.cachePut(target.key, entry);
        }
        return;
      }
      this.cachePut(target.key, entry);
      // 랜덤이 아닌 정렬로 확정되면 랜덤 시드와 목록을 버린다(REQ-DISP-021).
      if (target.sort !== 'random') {
        for (const key of [...this.cache.keys()])
          if (key.endsWith('|random')) this.cache.delete(key);
      }
      this.setState((cur) =>
        this.withDerived({ ...cur, ...this.contentOf(entry, cur), refreshing: false }),
      );
      this.lastGood = this.getSnapshot();
    } catch (error) {
      if (stale() || error instanceof CancelledError) return;
      if (error instanceof HttpError && error.status === 404) {
        // 주제는 있는데 사진 목록이 404: 빈 전시다.
        this.setState((cur) =>
          this.withDerived({
            ...cur,
            status: 'empty',
            photos: [],
            featured: [],
            hasNext: false,
            refreshing: false,
          }),
        );
        this.lastGood = this.getSnapshot();
        return;
      }
      // 인증 오류는 오류 화면·토스트 없이 정책대로만 처리한다(AuthErrorPolicy).
      if (this.authErrors.handle(error, ctx.generation)) {
        this.setState((cur) => this.withDerived({ ...cur, refreshing: false }));
        return;
      }
      this.onFailure(error);
    }
  }

  /** 주제가 없다(404). 처음 여는 날짜면 빈 상태, 이동 중이면 직전 전시로 복원하고 안내한다. */
  private onTopicMissing(): void {
    if (this.lastGood) {
      this.restore();
      this.deps.toast.show(t('display.date-missing'));
      return;
    }
    this.setState((cur) =>
      this.withDerived({
        ...cur,
        status: 'empty',
        errorKind: null,
        topic: null,
        photos: [],
        featured: [],
        hasNext: false,
        refreshing: false,
      }),
    );
    this.lastGood = this.getSnapshot();
  }

  private onFailure(error: unknown): void {
    const s = this.getSnapshot();
    if (s.status === 'content' || s.status === 'empty') {
      // 이미 보이는 내용이 있다: 유지하고 토스트만(REQ-DISP-031). 새로 고르던 정렬·추천은 직전 확정 값으로 되돌린다
      // (사진은 그대로인데 sort만 바뀌어 있으면 이어 받기가 엉뚱한 캐시를 보기 때문이다).
      const good = this.lastGood;
      this.setState((cur) =>
        this.withDerived({
          ...cur,
          ...(good
            ? { sort: good.sort, preferredSort: good.preferredSort, featured: good.featured }
            : {}),
          refreshing: false,
        }),
      );
      this.deps.toast.show(this.failureMessage(error));
      return;
    }
    if (this.lastGood) {
      this.restore();
      this.deps.toast.show(this.failureMessage(error));
      return;
    }
    this.setState((cur) =>
      this.withDerived({
        ...cur,
        status: 'error',
        errorKind: error instanceof NetworkError ? 'network' : 'generic',
        refreshing: false,
      }),
    );
  }

  private restore(): void {
    const good = this.lastGood;
    if (!good) return;
    this.setState((cur) =>
      this.withDerived({
        ...good,
        today: cur.today,
        scrollToTopToken: cur.scrollToTopToken,
        refreshing: false,
        paging: false,
      }),
    );
  }

  private failureMessage(error: unknown): string {
    return error instanceof NetworkError ? t('common.error.network') : t('display.error');
  }

  // ---- 상태 조립 ----

  /** 캐시 항목을 화면 상태로. 삭제·제거된 게시물과 겹치는 id를 걸러 낸다. */
  private contentOf(
    entry: Entry,
    cur: DisplayState,
  ): Pick<DisplayState, 'topic' | 'status' | 'errorKind' | 'photos' | 'featured' | 'hasNext'> {
    const seen = new Set<string>();
    const photos: PostSummary[] = [];
    for (const page of entry.pages) {
      for (const post of page) {
        if (seen.has(post.id)) continue;
        if (this.removedIds.has(post.id) || this.deps.changes.isDeleted(post.id)) continue;
        seen.add(post.id);
        photos.push(post);
      }
    }
    return {
      topic: entry.topic,
      status: photos.length > 0 ? 'content' : 'empty',
      errorKind: null,
      photos,
      featured: featuredOf(cur.mode, photos),
      hasNext: entry.hasNext,
    };
  }

  /** 상태에서 계산되는 값(이동 잠금, 이동 가능 여부)을 채운다. */
  private withDerived(state: Omit<DisplayState, Derived> | DisplayState): DisplayState {
    const locked = state.status === 'loading' && this.lastGood === null;
    return {
      ...state,
      navigationLocked: locked,
      canGoPrevious: !locked && state.date.compare(state.minDate) > 0,
      canGoNext: !locked && state.date.compare(state.today) < 0,
    };
  }

  // ---- 좋아요·게시물 변경 ----

  /**
   * 요청을 보낸 뒤(`since` 이후)에 끝난 좋아요 값(REQ-LIKE-009)과 그 뒤(`titleSince` 이후)에 바뀐 제목만 응답 위에 덮는다.
   * 보내기 전에 끝난 변경은 서버 응답이 이미 담고 있으므로 덮지 않는다.
   */
  private mergeLikes(
    posts: readonly PostSummary[],
    since: number,
    titleSince: number,
  ): PostSummary[] {
    return posts.map((post) => {
      const latest = this.deps.likes.latestSince(post.id, since);
      const withLikes = latest
        ? { ...post, likeCount: latest.likeCount, isLiked: latest.isLiked }
        : post;
      const renamed = this.titleChanges.get(post.id);
      return renamed && renamed.seq > titleSince
        ? { ...withLikes, title: renamed.title }
        : withLikes;
    });
  }

  private onLikeChange(change: LikeChange): void {
    if (change.kind === 'removed') {
      this.removedIds.add(change.postId);
      this.patchPosts((p) => (p.id === change.postId ? null : p));
      return;
    }
    const { snapshot } = change;
    this.patchPosts((p) =>
      p.id === snapshot.postId
        ? { ...p, likeCount: snapshot.likeCount, isLiked: snapshot.isLiked }
        : p,
    );
  }

  private onPostChange(change: PostChange): void {
    if (change.kind === 'deleted') {
      this.patchPosts((p) => (p.id === change.postId ? null : p));
      return;
    }
    this.changeSeq += 1;
    this.titleChanges.set(change.postId, { title: change.title, seq: this.changeSeq });
    this.patchPosts((p) => (p.id === change.postId ? { ...p, title: change.title } : p));
  }

  /** 캐시 전체와 보이는 상태, 복원용 상태에 같은 변경을 적용한다(null이면 뺀다). */
  private patchPosts(fn: (post: PostSummary) => PostSummary | null): void {
    const mapList = (list: readonly PostSummary[]): readonly PostSummary[] => {
      let changed = false;
      const out: PostSummary[] = [];
      for (const post of list) {
        const next = fn(post);
        if (next !== post) changed = true;
        if (next) out.push(next);
      }
      return changed ? out : list;
    };
    for (const [key, entry] of this.cache) {
      const pages = entry.pages.map(mapList);
      if (pages.some((page, i) => page !== entry.pages[i]))
        this.cache.set(key, { ...entry, pages });
    }
    const patchState = (s: DisplayState): DisplayState => {
      const photos = mapList(s.photos);
      return photos === s.photos ? s : { ...s, photos, featured: featuredOf(s.mode, photos) };
    };
    if (this.lastGood) this.lastGood = patchState(this.lastGood);
    this.setState((s) => patchState(s));
  }
}

function initialState(
  today: KstDate,
  preferredSort: PostSort,
  scrollToTopToken: number,
): DisplayState {
  return {
    date: today,
    today,
    minDate: FIRST_TOPIC_KST_DATE,
    mode: 'latest',
    sort: preferredSort,
    preferredSort,
    topic: null,
    status: 'loading',
    errorKind: null,
    photos: [],
    featured: [],
    featuredPage: 0,
    hasNext: false,
    refreshing: false,
    paging: false,
    navigationLocked: true,
    canGoPrevious: false,
    canGoNext: false,
    scrollToTopToken,
  };
}
