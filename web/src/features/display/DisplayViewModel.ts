import { FIRST_TOPIC_DATE } from '../../constants';
import { t } from '../../copy/ko';
import { NetworkError, SessionChangedError } from '../../core/net/errors';
import { StaleGuard } from '../../core/state/StaleGuard';
import type { Ticket } from '../../core/state/StaleGuard';
import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import { MidnightWatcher } from '../../core/time/MidnightWatcher';
import { kstToday } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import type { SessionMode } from '../boot/authGate';
import type { PostLikeStore } from '../like/PostLikeStore';
import type { PostChanges } from '../post/PostChanges';
import type { PostChange, PostItem } from '../post/postModels';
import type { PostDetailNavigator } from '../post/postNavigation';
import type { GuestGate } from '../shell/GuestGate';
import { clampDisplayDate, isArchiveDate, shiftDate, toPickedDate } from './displayDates';
import type { DisplaySort } from './displayDates';
import type { DisplayRepository, PostsPage } from './DisplayRepository';
import { DisplayListingCache } from './DisplayListingCache';

/** 전시 본문. 날짜 이동 중 404·실패는 상태를 바꾸지 않는다(이전 ready 복원, 토스트). */
export type DisplayBody =
  /** 첫 로딩(보이는 사진이 없는 상태에서 날짜·정렬을 정해 읽는 중). 날짜 이동을 막는다(REQ-DISP-011). */
  | { status: 'loading' }
  /** 주제 404 또는 사진 0장(REQ-DISP-014). */
  | { status: 'empty' }
  /** 보이는 사진이 없을 때의 실패. network는 연결 실패·타임아웃. 다시 시도는 retry(). */
  | { status: 'error'; network: boolean }
  | {
      status: 'ready';
      topicTitle: string;
      /** 지금 보이는 전체 목록(서버 순서, 페이지 누적, id 중복 제거). */
      posts: PostItem[];
      /** 아카이브면 posts의 앞 5개(같은 좋아요 값), 아니면 빈 배열. */
      featured: PostItem[];
      hasNext: boolean;
      /** 기존 사진을 유지한 채 정렬·날짜 변경 또는 첫 페이지를 재검증 중(display.refresh-indicator). */
      refreshing: boolean;
      /** 다음 페이지 요청 중(display.load-more-indicator). */
      paging: boolean;
      /** 다음 페이지 요청이 실패한 횟수. 화면이 센티넬을 다시 세우는 열쇠로 쓴다(스크롤로 같은 페이지를 재요청, TC-DISP-026). */
      pageFailures: number;
    };

export interface DisplayState {
  mode: SessionMode;
  /** 날짜 상한: KST 오늘. */
  today: DateString;
  /** 선택한 날짜(이동 중이면 이동하려는 날짜). 이동 실패 시 마지막으로 보인 날짜로 되돌아간다. */
  date: DateString;
  /** 오늘 날짜에서 고른 정렬(기본 recent). 아카이브를 보는 동안에도 유지되어 오늘로 돌아오면 복원된다(REQ-DISP-017). */
  sort: DisplaySort;
  /** 실제로 요청하는 정렬: date가 오늘이면 sort, 아니면 popular. */
  requestSort: DisplaySort;
  /** date < today(정렬 탭 숨김, 추천 카드). */
  archive: boolean;
  body: DisplayBody;
  /** 하한(FIRST_TOPIC_DATE)이 아니고 첫 로딩 중이 아닐 때만. */
  canGoPrevious: boolean;
  /** 오늘이 아니고 첫 로딩 중이 아닐 때만. */
  canGoNext: boolean;
  /** 같은 날짜의 아카이브를 다시 불러와도 유지되고 다른 날짜로 가면 0으로 돌아간다(REQ-DISP-019). */
  featuredPage: number;
  /** 전시 탭 재선택마다 +1. 화면이 맨 위로 스크롤한다(REQ-DISP-029). */
  scrollToTop: number;
}

export interface DisplayViewModelDeps {
  mode: SessionMode;
  clock: Clock;
  repository: DisplayRepository;
  likes: PostLikeStore;
  changes: PostChanges;
  toast: ToastController;
  guestGate: GuestGate;
  navigator: PostDetailNavigator;
}

/**
 * 전시 탭 로직(화면은 그리기만). 컨테이너가 모드별로 하나를 보관하고(displaySession) 화면은 붙었다 떨어진다: 상세에 갔다 와도 목록·정렬·날짜가 남는다.
 *
 * 규칙 요약
 * - (날짜, 정렬) 키로 목록·다음 페이지 번호·시드·주제 제목을 캐시한다. 캐시가 있으면 즉시 보여 주고 첫 페이지를 조용히 재검증한다.
 *   재검증은 첫 페이지만 교체하고 같은 정렬·시드의 뒤쪽 페이지는 유지한다(시드가 바뀌면 뒤쪽을 버린다).
 * - 요청은 취소하지 않는다: 이전 (날짜, 정렬) 요청의 늦은 응답은 지금 상태를 덮지 않고 그 키의 캐시에만 남는다(stale 보호). 화면 이탈(onHidden)·계정 전환은 모두 무효화한다.
 * - 보이는 사진이 있으면 실패는 토스트(5xx·계약 위반 `display.error`, 연결 실패 `common.error.network`), 없으면 오류 화면(D-20).
 * - 응답의 좋아요 값은 likes.beginRead()/merge로 보정하고 changes의 like/removed 이벤트를 목록·추천·캐시에 반영한다. 삭제된 게시물은 changes.withoutRemoved로 거른다.
 * - 게스트는 인증 헤더 없는 공개 API만 쓰고 응답의 isLiked·isMine을 모두 false로 다룬다(D-05).
 */
/** 아카이브 추천 카드 수(REQ-DISP-018). */
const FEATURED_COUNT = 5;

type View = { kind: 'loading' } | { kind: 'empty' } | { kind: 'error'; network: boolean } | { kind: 'ready' };

const keyOf = (date: DateString, requestSort: DisplaySort): string => `${date}|${requestSort}`;
const isCancel = (error: unknown): boolean => (error instanceof Error && error.name === 'AbortError') || error instanceof SessionChangedError;

export class DisplayViewModel extends ViewModel<DisplayState> {
  private readonly cache = new DisplayListingCache();
  private view: View = { kind: 'loading' };
  /** 지금 목록으로 보여 주는 캐시 키와 그 날짜. 날짜 이동 중에는 state.date(이동하려는 날짜)와 다를 수 있다. */
  private shown: { key: string; date: DateString } | null = null;
  /** 마지막으로 성공적으로 보여 준 (날짜, 정렬). 날짜 이동이 실패하면 여기로 되돌린다. */
  private good: { date: DateString; sort: DisplaySort; featuredPage: number } | null = null;
  private refreshing = false;
  private paging = false;
  private pageFailures = 0;
  private started = false;
  private visible = false;
  /** 계정 전환마다 무효화한다(snapshot 티켓 여러 개가 함께 쓴다). 이전 계정의 늦은 응답은 캐시에도 남기지 않는다. */
  private readonly accountGuard = new StaleGuard();
  /** 로드·이동·재검증을 시작할 때마다 새 티켓을 연다. 최신이 아닌 응답은 캐시에만 반영한다. */
  private readonly navGuard = new StaleGuard();
  /** 다음 페이지 요청의 최신성(이동·화면 이탈이 무효화). */
  private readonly pageGuard = new StaleGuard();
  /** 아직 유효한 로드·재검증이 있으면 그 티켓과 키. 같은 키의 요청이 진행 중이면 새로 보내지 않고 그 약속을 공유한다. 화면 이탈이 지운다. */
  private active: { ticket: Ticket; key: string } | null = null;
  private readonly midnight: MidnightWatcher;
  /** 진행 중인 첫 페이지 읽기(키별). 더 새 요청이 이전 요청을 밀어낸 뒤 같은 키로 돌아와도 같은 네트워크 요청을 공유한다. */
  private readonly reads = new Map<string, Promise<unknown>>();
  private inflight: Promise<void> = Promise.resolve();
  private readonly unsubscribeChanges: () => void;

  constructor(protected readonly deps: DisplayViewModelDeps) {
    const today = kstToday(deps.clock);
    super({
      mode: deps.mode,
      today,
      date: today,
      sort: 'recent',
      requestSort: 'recent',
      archive: false,
      body: { status: 'loading' },
      canGoPrevious: false,
      canGoNext: false,
      featuredPage: 0,
      scrollToTop: 0,
    });
    this.unsubscribeChanges = deps.changes.subscribe((change) => this.applyChange(change));
    this.midnight = new MidnightWatcher({ clock: deps.clock, onDateChanged: () => this.onDateChanged() });
  }

  // ---------------------------------------------------------------- 진입·수명

  /**
   * URL의 date·sort를 반영한다. 처음 부르면 전시를 연다(date 없음 = KST 오늘, sort 없음 = recent. 범위 밖 날짜는 가장 가까운 끝으로).
   * 이미 같은 날짜·정렬이면 아무 일도 하지 않는다(화면이 상태를 URL에 replace로 되써도 다시 불러오지 않는다, REQ-DISP-010).
   * 다르면 사용자가 고른 것과 같게 날짜/정렬을 바꾼다. 돌려준 약속은 그 로드(와 재검증)가 끝나면 이행된다.
   */
  applyRoute(route: { date: DateString | null; sort: DisplaySort | null }): Promise<void> {
    const today = this.started ? this.state.today : kstToday(this.deps.clock);
    const wanted = route.date !== null && toPickedDate(route.date) ? route.date : today;
    const date = clampDisplayDate(wanted, today);
    const sort = route.sort ?? 'recent';
    if (this.started && date === this.state.date && sort === this.state.sort) return this.inflight;
    this.started = true;
    if (today !== this.state.today) this.setState({ today });
    return this.navigate(date, sort);
  }

  /** 화면이 보인다(마운트·문서가 다시 보임). 처음이면 로드, 아니면 오늘 상한을 다시 계산하고(REQ-DISP-015) 현재 키의 첫 페이지를 조용히 재검증한다(REQ-DISP-030). */
  onShown(): Promise<void> {
    if (this.visible) return this.inflight;
    this.visible = true;
    this.midnight.start();
    if (!this.started) {
      this.started = true;
      const today = kstToday(this.deps.clock);
      return this.navigate(today, 'recent');
    }
    const today = kstToday(this.deps.clock);
    if (today !== this.state.today) this.publish({ today });
    // 마운트 직후 applyRoute가 시작한 첫 로드가 아직 유효하면 그대로 기다린다(같은 첫 페이지를 두 번 받지 않는다).
    if (this.active !== null) return this.inflight;
    return this.refreshCurrent();
  }

  /** 화면이 숨겨지거나 떨어진다: 진행 중 요청을 무효화한다. 취소는 오류 토스트·오류 화면이 되지 않는다(TC-DISP-048). */
  onHidden(): void {
    this.visible = false;
    this.midnight.stop();
    this.navGuard.invalidate();
    this.active = null;
    this.pageGuard.invalidate();
    this.paging = false;
    this.refreshing = false;
    this.publish();
  }

  /** 보이는 채로 KST 자정을 넘었다: today(날짜 상한)를 갱신하고, 진행 중인 요청이 없으면 지금 키를 맞춘다(아카이브가 된 날짜는 인기순으로, REQ-DISP-015). */
  private onDateChanged(): void {
    if (!this.visible) return;
    if (this.active !== null) {
      this.publish({ today: kstToday(this.deps.clock) });
      return;
    }
    void this.refreshCurrent();
  }

  /** 이전 날짜(하루 전). 하한이거나 첫 로딩 중이면 아무 일도 없다. 이동 중이면 이동하려는 날짜 기준이다(TC-DISP-038). */
  selectPreviousDate(): Promise<void> {
    if (!this.state.canGoPrevious) return Promise.resolve();
    return this.moveToDate(shiftDate(this.state.date, -1));
  }

  /** 다음 날짜(하루 후). 오늘이거나 첫 로딩 중이면 아무 일도 없다. */
  selectNextDate(): Promise<void> {
    if (!this.state.canGoNext) return Promise.resolve();
    return this.moveToDate(shiftDate(this.state.date, 1));
  }

  /** 날짜 선택. normalizePickedDate와 같은 규칙으로 범위에 맞추고, 지금 선택된 날짜면 다시 불러오지 않는다. */
  selectDate(date: DateString): Promise<void> {
    if (this.view.kind === 'loading' || !toPickedDate(date)) return Promise.resolve();
    return this.moveToDate(clampDisplayDate(date, this.state.today));
  }

  /** 정렬 탭(오늘 날짜에서만). 지난 날짜에서는 무시한다. 새 결과가 올 때까지 기존 사진을 유지한다. */
  selectSort(sort: DisplaySort): Promise<void> {
    if (this.state.archive || sort === this.state.sort) return Promise.resolve();
    return this.navigate(this.state.date, sort);
  }

  /** 오류 화면의 다시 시도: 같은 (날짜, 정렬)을 첫 로딩부터 다시. */
  retry(): Promise<void> {
    this.cache.delete(keyOf(this.state.date, this.state.requestSort));
    this.view = { kind: 'loading' };
    this.shown = null;
    return this.navigate(this.state.date, this.state.sort);
  }

  /** 전시 탭 재선택: scrollToTop +1, 기존 전시를 유지한 채 첫 페이지 재검증(성공 → 교체, 실패 → 유지 + 토스트). */
  onTabReselect(): Promise<void> {
    this.publish({ scrollToTop: this.state.scrollToTop + 1 });
    if (this.active !== null) return this.inflight;
    return this.refreshCurrent();
  }

  /** 목록 끝 근처 센티넬(displaySentinelIndex)이 보인다. 다음 페이지를 요청한다(진행 중·재검증 중·hasNext=false면 아무 일도 없다). 실패 뒤 다시 보이면 같은 페이지를 다시 요청한다. */
  async onSentinelVisible(): Promise<void> {
    const shown = this.shown;
    const listing = shown ? this.cache.get(shown.key) : undefined;
    if (!shown || !listing || this.view.kind !== 'ready' || !listing.hasNext || this.paging || this.refreshing) return;
    const account = this.accountGuard.snapshot();
    const ticket = this.pageGuard.begin();
    const page = listing.pages.length + 1;
    const { seed } = listing;
    const requestSort = this.requestSortOf(shown.key);
    this.paging = true;
    this.publish();
    const stamp = this.deps.likes.beginRead();
    try {
      const result = await this.deps.repository.fetchPosts({ topicDate: shown.date, sort: requestSort, page, randomSeed: seed });
      if (!account.isCurrent()) return;
      this.cache.append(shown.key, { page, seed, posts: result ? this.settle(result.posts, stamp) : null, hasNext: result ? this.hasNextOf(result, requestSort) : false });
      if (ticket.isCurrent()) this.paging = false;
      this.publish();
    } catch (error) {
      if (!account.isCurrent() || !ticket.isCurrent()) return;
      this.paging = false;
      if (!isCancel(error)) {
        this.pageFailures += 1;
        this.deps.toast.show(this.failureCopy(error));
      }
      this.publish();
    }
  }

  /** (스크롤 위치 신호용) 마지막으로 보이는 항목의 인덱스가 posts.length-3 이상이면 onSentinelVisible과 같다. */
  onLastVisibleIndexChanged(index: number): Promise<void> {
    const body = this.state.body;
    if (body.status !== 'ready' || index < body.posts.length - 3) return Promise.resolve();
    return this.onSentinelVisible();
  }

  /** 사진 탭: 게스트는 `nav.guest.feed` 토스트(이동·요청 없음), 회원은 navigator.openPostDetail({ postId, seed: 지금 보이는 항목 }). */
  onPostPress(postId: string): void {
    const post = this.visiblePost(postId);
    if (!post) return;
    if (!this.deps.guestGate.requireMember(this.deps.mode, 'feed')) return;
    this.deps.navigator.openPostDetail({ postId: post.id, seed: post });
  }

  /** 하트 탭: 게스트는 `nav.guest.like` 토스트(요청·상태 변화 없음), 회원은 likes.toggle(지금 보이는 항목). */
  async onLikePress(postId: string): Promise<void> {
    const post = this.visiblePost(postId);
    if (!post) return;
    if (!this.deps.guestGate.requireMember(this.deps.mode, 'like')) return;
    await this.deps.likes.toggle(post);
  }

  /** 추천 카드 페이저의 현재 페이지. */
  setFeaturedPage(page: number): void {
    if (this.good && this.good.date === this.state.date) this.good = { ...this.good, featuredPage: page };
    this.publish({ featuredPage: page });
  }

  /** 계정 전환·로그아웃: 캐시·시드·상태를 버리고 처음 상태로. 이전 계정의 늦은 응답은 무시한다. 보이고 있으면 곧바로 다시 불러온다. */
  resetForAccountChange(): void {
    this.accountGuard.invalidate();
    this.navGuard.invalidate();
    this.pageGuard.invalidate();
    this.active = null;
    this.cache.clear();
    this.reads.clear();
    this.view = { kind: 'loading' };
    this.shown = null;
    this.good = null;
    this.refreshing = false;
    this.paging = false;
    this.pageFailures = 0;
    this.started = false;
    this.inflight = Promise.resolve();
    const today = kstToday(this.deps.clock);
    this.replaceState({
      mode: this.deps.mode,
      today,
      date: today,
      sort: 'recent',
      requestSort: 'recent',
      archive: false,
      body: { status: 'loading' },
      canGoPrevious: false,
      canGoNext: false,
      featuredPage: 0,
      scrollToTop: this.state.scrollToTop,
    });
    if (this.visible) {
      this.started = true;
      void this.navigate(today, 'recent');
    }
  }

  override dispose(): void {
    this.unsubscribeChanges();
    this.midnight.stop();
    this.accountGuard.invalidate();
    this.navGuard.invalidate();
    this.active = null;
    super.dispose();
  }

  // ---------------------------------------------------------------- 이동·로드

  private moveToDate(date: DateString): Promise<void> {
    if (date === this.state.date) return Promise.resolve();
    return this.navigate(date, this.state.sort);
  }

  private requestSortOf(key: string): DisplaySort {
    return key.slice(key.indexOf('|') + 1) as DisplaySort;
  }

  /** 지금 키(날짜, 정렬)를 다시 맞춘다: 이미 그 목록을 보여 주고 있으면 첫 페이지 조용한 재검증, 아니면 이동. */
  private refreshCurrent(): Promise<void> {
    const today = kstToday(this.deps.clock);
    if (today !== this.state.today) this.publish({ today });
    const { date, sort } = this.state;
    const key = keyOf(date, isArchiveDate(date, today) ? 'popular' : sort);
    if (this.view.kind === 'ready' && this.shown?.key === key) return this.startRevalidate(key, date);
    return this.navigate(date, sort);
  }

  /** (날짜, 정렬)을 보여 준다. 캐시가 있으면 즉시 보이고 조용히 재검증, 없으면 불러온다(보이는 사진이 있으면 유지하며 refreshing, 없으면 로딩). */
  private navigate(date: DateString, sort: DisplaySort): Promise<void> {
    const today = this.state.today;
    const requestSort: DisplaySort = isArchiveDate(date, today) ? 'popular' : sort;
    const key = keyOf(date, requestSort);
    // 같은 키의 읽기가 이미 진행 중이면 새 요청을 보내지 않고 그 약속을 공유한다(상태는 그 요청이 시작될 때 이미 이 날짜·정렬로 게시됐다).
    if (this.active?.key === key && this.active.ticket.isCurrent() && date === this.state.date && sort === this.state.sort) return this.inflight;
    const nav = this.navGuard.begin();
    const account = this.accountGuard.snapshot();
    this.active = { ticket: nav, key };
    this.pageGuard.invalidate();
    this.paging = false;
    const dateChanged = date !== this.state.date;
    const featuredPage = dateChanged ? 0 : this.state.featuredPage;
    if (dateChanged) this.pageFailures = 0;
    const cached = this.cache.get(key);
    if (cached) {
      this.shown = { key, date };
      this.view = { kind: 'ready' };
      this.good = { date, sort, featuredPage };
      this.refreshing = true;
      this.publish({ date, sort, featuredPage });
      return (this.inflight = this.revalidate(key, date, requestSort, nav, account));
    }
    const hadContent = this.view.kind === 'ready' && this.shown !== null;
    if (hadContent) this.refreshing = true;
    else {
      this.view = { kind: 'loading' };
      this.refreshing = false;
    }
    this.publish({ date, sort, featuredPage });
    return (this.inflight = this.loadFresh({ key, date, sort, requestSort, nav, account, hadContent }));
  }

  private async loadFresh(args: { key: string; date: DateString; sort: DisplaySort; requestSort: DisplaySort; nav: Ticket; account: Ticket; hadContent: boolean }): Promise<void> {
    const { key, date, sort, requestSort, nav, account, hadContent } = args;
    let result: { title: string; page: PostsPage; stamp: number } | null;
    try {
      result = await this.fetchFirst(date, requestSort);
    } catch (error) {
      if (!account.isCurrent() || !nav.isCurrent()) return;
      this.active = null;
      if (isCancel(error)) {
        this.refreshing = false;
        this.publish();
        return;
      }
      if (hadContent) {
        this.restore();
        this.deps.toast.show(this.failureCopy(error));
      } else {
        this.view = { kind: 'error', network: error instanceof NetworkError };
        this.refreshing = false;
        this.publish();
      }
      return;
    }
    if (!account.isCurrent()) return;
    if (result) this.cache.start(key, this.listingInit(result.title, result.page, requestSort, result.stamp));
    if (!nav.isCurrent()) return;
    this.active = null;
    if (!result && hadContent) {
      this.restore();
      this.deps.toast.show(t('display.date-missing'));
      return;
    }
    this.refreshing = false;
    this.pageFailures = 0;
    if (result) {
      this.shown = { key, date };
      this.view = { kind: 'ready' };
    } else {
      this.shown = null;
      this.view = { kind: 'empty' };
    }
    this.good = { date, sort, featuredPage: this.state.featuredPage };
    this.publish();
  }

  /** 날짜 이동·정렬 변경이 실패했다: 마지막으로 보여 준 날짜·정렬과 목록으로 되돌린다. */
  private restore(): void {
    this.refreshing = false;
    const good = this.good;
    if (good) this.publish({ date: good.date, sort: good.sort, featuredPage: good.featuredPage });
    else this.publish();
  }

  private startRevalidate(key: string, date: DateString): Promise<void> {
    if (this.active?.key === key && this.active.ticket.isCurrent()) return this.inflight;
    const nav = this.navGuard.begin();
    this.active = { ticket: nav, key };
    this.refreshing = true;
    this.publish();
    return (this.inflight = this.revalidate(key, date, this.requestSortOf(key), nav, this.accountGuard.snapshot()));
  }

  /** 캐시된 목록의 첫 페이지를 다시 받아 교체한다(같은 시드의 뒤쪽 페이지는 유지). 실패하면 목록을 유지하고 토스트. */
  private async revalidate(key: string, date: DateString, requestSort: DisplaySort, nav: Ticket, account: Ticket): Promise<void> {
    const listing = this.cache.get(key);
    if (!listing) return;
    const stamp = this.deps.likes.beginRead();
    let page: PostsPage | null;
    try {
      page = await this.shareRead(`revalidate|${key}|${listing.seed ?? ''}`, () => this.deps.repository.fetchPosts({ topicDate: date, sort: requestSort, page: 1, randomSeed: listing.seed }));
    } catch (error) {
      if (!account.isCurrent() || !nav.isCurrent()) return;
      this.active = null;
      this.refreshing = false;
      this.publish();
      if (!isCancel(error)) this.deps.toast.show(this.failureCopy(error));
      return;
    }
    if (!account.isCurrent()) return;
    if (page) {
      const keepsTail = requestSort !== 'random' || page.randomSeed === this.cache.get(key)?.seed;
      this.cache.replaceFirst(key, { first: this.settle(page.posts, stamp), keepsTail, hasNext: this.hasNextOf(page, requestSort), seed: page.randomSeed });
    }
    if (!nav.isCurrent()) {
      this.publish();
      return;
    }
    this.active = null;
    this.refreshing = false;
    this.publish();
  }

  /** 같은 id의 읽기가 진행 중이면 그 약속을 돌려주고, 없으면 시작한다. 끝나면(성공·실패) 목록에서 뺀다. */
  private shareRead<T>(id: string, start: () => Promise<T>): Promise<T> {
    const running = this.reads.get(id) as Promise<T> | undefined;
    if (running) return running;
    const promise = start().finally(() => {
      if (this.reads.get(id) === promise) this.reads.delete(id);
    });
    this.reads.set(id, promise);
    return promise;
  }

  private fetchFirst(date: DateString, requestSort: DisplaySort): Promise<{ title: string; page: PostsPage; stamp: number } | null> {
    return this.shareRead(`first|${keyOf(date, requestSort)}`, () => this.readFirst(date, requestSort));
  }

  private async readFirst(date: DateString, requestSort: DisplaySort): Promise<{ title: string; page: PostsPage; stamp: number } | null> {
    const topic = await this.deps.repository.fetchTopic(date);
    if (!topic) return null;
    const stamp = this.deps.likes.beginRead();
    const page = await this.deps.repository.fetchPosts({ topicDate: topic.topicDate, sort: requestSort, page: 1, randomSeed: null });
    return page ? { title: topic.title, page, stamp } : null;
  }

  // ---------------------------------------------------------------- 목록 가공

  /** 응답 항목을 정리한다: 게스트는 isLiked·isMine을 false로, 삭제된 게시물은 빼고, 읽기 이후의 좋아요 변경은 지킨다. */
  private settle(posts: PostItem[], stamp: number): PostItem[] {
    const own = this.deps.mode === 'guest' ? posts.map((post) => ({ ...post, isLiked: false, isMine: false })) : posts;
    return this.deps.likes.merge(this.deps.changes.withoutRemoved(own), stamp);
  }

  /** 랜덤 순서인데 시드를 못 받았으면 다음 페이지를 이어 받을 수 없다(REQ-DISP-021, TC-DISP-019). */
  private hasNextOf(page: PostsPage, requestSort: DisplaySort): boolean {
    return page.hasNext && (requestSort !== 'random' || page.randomSeed !== null);
  }

  private listingInit(title: string, page: PostsPage, requestSort: DisplaySort, stamp: number) {
    return { topicTitle: title, first: this.settle(page.posts, stamp), hasNext: this.hasNextOf(page, requestSort), seed: requestSort === 'random' ? page.randomSeed : null };
  }

  private visiblePost(postId: string): PostItem | undefined {
    const body = this.state.body;
    if (body.status !== 'ready') return undefined;
    return body.posts.find((post) => post.id.toLowerCase() === postId.toLowerCase());
  }

  private failureCopy(error: unknown): string {
    return error instanceof NetworkError ? t('common.error.network') : t('display.error');
  }

  // ---------------------------------------------------------------- 변경 이벤트

  private applyChange(change: PostChange): void {
    this.cache.applyChange(change);
    this.publish();
  }

  // ---------------------------------------------------------------- 상태 게시

  private buildBody(): DisplayBody {
    switch (this.view.kind) {
      case 'loading':
        return { status: 'loading' };
      case 'empty':
        return { status: 'empty' };
      case 'error':
        return { status: 'error', network: this.view.network };
      case 'ready': {
        const listing = this.shown ? this.cache.get(this.shown.key) : undefined;
        if (!listing) return { status: 'loading' };
        if (listing.posts.length === 0 && !listing.hasNext) return { status: 'empty' };
        const archive = this.shown !== null && isArchiveDate(this.shown.date, this.state.today);
        return {
          status: 'ready',
          topicTitle: listing.topicTitle,
          posts: listing.posts,
          featured: archive ? listing.posts.slice(0, FEATURED_COUNT) : [],
          hasNext: listing.hasNext,
          refreshing: this.refreshing,
          paging: this.paging,
          pageFailures: this.pageFailures,
        };
      }
    }
  }

  /** 내부 필드로 body와 파생 값(archive, requestSort, 이동 가능 여부)을 다시 만들어 상태로 게시한다. */
  private publish(patch: Partial<Pick<DisplayState, 'today' | 'date' | 'sort' | 'featuredPage' | 'scrollToTop'>> = {}): void {
    const today = patch.today ?? this.state.today;
    const date = patch.date ?? this.state.date;
    const sort = patch.sort ?? this.state.sort;
    const archive = isArchiveDate(date, today);
    const body = this.buildBody();
    const settled = body.status !== 'loading';
    this.setState({
      ...patch,
      body,
      archive,
      requestSort: archive ? 'popular' : sort,
      canGoPrevious: settled && date > FIRST_TOPIC_DATE,
      canGoNext: settled && date < today,
    });
  }
}
