import { t } from '../../copy/ko';
import { ApiError, NetworkError, isAbandoned } from '../../core/net/errors';
import { StaleGuard } from '../../core/state/StaleGuard';
import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import { MidnightWatcher } from '../../core/time/MidnightWatcher';
import { kstToday } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import type { SessionMode } from '../boot/authGate';
import type { PostChanges } from '../post/PostChanges';
import type { PostChange } from '../post/postModels';
import { buildCalendarImageModel, readPngSize } from './calendarImage';
import type { CalendarImageExporter } from './CalendarImageExporter';
import { SaveDeniedError } from './FileDownloader';
import type { FileDownloader } from './FileDownloader';
import type { RecordNavigator } from './recordNavigation';
import type { CalendarPost, YearMonth } from './recordModels';
import { calendarFileName, compareMonths, currentYearMonth, mergeAvailableMonths, monthKey, monthOfDate, sameMonth } from './recordMonths';
import type { RecordRepository } from './RecordRepository';

/** 오류 화면의 종류: unauthorized(401), invalid-month(400), network(연결 실패·타임아웃), other(그 밖: 5xx·403·계약 위반). */
export type RecordErrorKind = 'unauthorized' | 'invalid-month' | 'network' | 'other';

export type RecordBody =
  /** 캐시 없는 달의 첫 불러오기 중(이전 달 내용은 비운다). 화면 이탈로 취소된 첫 조회도 오류가 아니라 이 상태로 남는다. */
  | { status: 'loading' }
  /** 캐시 없는 달의 첫 불러오기 실패(REQ-REC-024). 달력 내용은 비운다. */
  | { status: 'error'; kind: RecordErrorKind }
  /** posts는 topicDate 오름차순. 비어 있으면 빈 달(오류 아님). revalidating은 캐시를 보여 주며 서버에 다시 확인하는 중. */
  | { status: 'ready'; posts: CalendarPost[]; revalidating: boolean };

export interface RecordState {
  mode: SessionMode;
  /** KST 오늘(자정·포그라운드 복귀 때 다시 계산한다). */
  today: DateString;
  /** KST 현재 달. */
  currentMonth: YearMonth;
  /** 서버 월 목록 ∪ 현재 달, 최신순(REQ-REC-002). */
  availableMonths: YearMonth[];
  /** 보고 있는(또는 불러오는 중인) 달. */
  month: YearMonth;
  /** 선택한 날짜. 사진이 있는 날만 가능하다(REQ-REC-030). 없으면 null. */
  selectedDate: DateString | null;
  /** selectedDate의 사진. */
  selectedPost: CalendarPost | null;
  /** 선택지의 가장 오래된 달이 아니면 true. */
  canGoPrevious: boolean;
  /** 선택지의 가장 최신 달이 아니면 true. */
  canGoNext: boolean;
  body: RecordBody;
  /** PENDING 배지 안내 풍선이 열려 있는가. */
  pendingHintOpen: boolean;
  /** 이미지 저장 중(연타 무시). */
  saving: boolean;
}

export interface RecordViewModelDeps {
  mode: SessionMode;
  clock: Clock;
  repository: RecordRepository;
  changes: PostChanges;
  toast: ToastController;
  navigator: RecordNavigator;
  exporter: CalendarImageExporter;
  downloader: FileDownloader;
}

/**
 * 기록 탭 로직(화면은 그리기만). 컨테이너가 모드별로 하나를 보관하고(recordSession) 화면은 붙었다 떨어진다: 피드·전시에 갔다 와도 달·날짜·캐시가 남는다.
 *
 * 규칙 요약(구현 단계의 근거)
 * - 월 선택지 = 서버 월 목록 ∪ KST 현재 달(최신순). 월 목록 실패는 조용히 현재 달만으로 진행한다(REQ-REC-008). 월 이동은 선택지 안에서만, 같은 달·선택지 밖은 무시(요청도 상태 변화도 없다).
 * - 달 단위 캐시: 캐시가 있으면 즉시 보여 주고(revalidating) 곧바로 다시 요청한다. 같은 달의 진행 중 요청은 공유한다(applyRoute와 onShown이 연달아 불려도 요청은 1건).
 *   최신 선택이 아닌 달의 늦은 응답은 화면을 덮지 않고 그 달의 캐시에만 남는다(REQ-REC-026). onHidden·계정 전환은 진행 중 요청을 취소/무효화한다.
 * - 실패: 캐시 없음 → error 본문(401 unauthorized, 400 invalid-month, 연결 실패 network, 그 밖 other), 캐시 있음 → 내용 유지 + 토스트(연결 실패는 common.error.network, 그 밖은 record.err.other).
 *   취소(AbortError)·SessionChangedError는 오류로 보이지 않는다(loading 유지).
 * - 선택 날짜: 달을 불러오면 기본은 그 달 최신 사진 날짜. 재검증·캐시 교체 때는 그 날짜가 아직 있으면 유지, 없으면 기본 규칙. URL 진입(applyRoute) 날짜는 그 날짜에 사진이 있을 때만 쓰고, 첫 조회가 실패해도 다시 시도에서 쓴다.
 * - changes: removed는 삭제 기억(changes.wasRemoved)으로 응답·캐시에서 거르고(보이는 달이면 즉시 선택 보정), created는 그 topicDate 달의 캐시를 버리고 보이는 중이면 조용히 다시 불러온다. 월 선택지는 삭제로 임의로 줄이지 않는다(REQ-REC-029).
 * - 게스트(mode=guest)는 어떤 API도 부르지 않는다(REQ-REC-040).
 */

function errorKindOf(error: unknown): RecordErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'unauthorized';
    if (error.status === 400) return 'invalid-month';
    return 'other';
  }
  return error instanceof NetworkError ? 'network' : 'other';
}

export class RecordViewModel extends ViewModel<RecordState> {
  /** 달별 서버 응답(삭제 거르기 전 원본). 보여 줄 때 changes.wasRemoved로 거른다. */
  private readonly cache = new Map<string, CalendarPost[]>();
  /** 달별로 사용자가 고른(또는 URL이 지정한) 날짜. 그 날짜에 사진이 있을 때만 쓰인다. */
  private readonly picks = new Map<string, DateString>();
  private serverMonths: YearMonth[] = [];
  /** 월 목록 조회가 한 번 끝났다(성공이든 현재 달만으로 진행하든). */
  private optionsReady = false;
  private started = false;
  private visible = false;
  /** applyRoute·onShown이 시작한 첫 열기(월 목록 + 달). 진행 중이면 공유한다. */
  private opening: Promise<void> | null = null;
  private running: Promise<void> = Promise.resolve();
  private monthsRead: Promise<void> | null = null;
  /** 달별 진행 중 읽기. 같은 달의 요청은 새로 보내지 않고 공유한다. */
  private readonly reads = new Map<string, Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  /** 계정 전환마다 무효화. 이전 계정의 늦은 응답은 캐시에도 남기지 않는다. */
  private readonly accountGuard = new StaleGuard();
  /** 가장 최근에 고른 달(이동·재검증을 시작할 때마다 새 티켓). 최신이 아닌 응답은 캐시에만 반영한다. */
  private readonly navGuard = new StaleGuard();
  /** 화면 이탈마다 무효화(열기 흐름이 이탈 뒤 이어지지 않게). */
  private readonly lifeGuard = new StaleGuard();
  private readonly midnight: MidnightWatcher;
  private readonly unsubscribeChanges: () => void;

  constructor(protected readonly deps: RecordViewModelDeps) {
    super(RecordViewModel.initialState(deps));
    this.unsubscribeChanges = deps.changes.subscribe((change) => this.applyChange(change));
    this.midnight = new MidnightWatcher({ clock: deps.clock, onDateChanged: () => this.onDateChanged() });
  }

  private static initialState(deps: RecordViewModelDeps): RecordState {
    const currentMonth = currentYearMonth(deps.clock);
    return {
      mode: deps.mode,
      today: kstToday(deps.clock),
      currentMonth,
      availableMonths: [],
      month: currentMonth,
      selectedDate: null,
      selectedPost: null,
      canGoPrevious: false,
      canGoNext: false,
      body: { status: 'loading' },
      pendingHintOpen: false,
      saving: false,
    };
  }

  private get isGuest(): boolean {
    return this.deps.mode === 'guest';
  }

  // ---------------------------------------------------------------- 진입·수명

  /** URL 진입 값 반영(마운트·Link·주소 변경). date가 null이면 아무것도 하지 않는다. 사진이 있는 날짜일 때만 그 달·날짜를 연다(REQ-REC-032). 같은 값이면 요청도 상태 변화도 없다. */
  applyRoute(route: { date: DateString | null }): Promise<void> {
    if (this.isGuest || route.date === null) return this.opening ?? Promise.resolve();
    const date = route.date;
    const target = monthOfDate(date);
    if (!target) return Promise.resolve();
    if (!this.started) {
      // 첫 열기가 월 목록을 기다리는 중이면 끝난 뒤에 같은 규칙으로 반영한다.
      if (this.opening) return this.opening.then(() => this.applyRoute(route));
      return this.open(date);
    }
    if (sameMonth(target, this.state.month) && this.state.body.status === 'ready') {
      this.selectDate(date);
      return this.running;
    }
    if (!this.state.availableMonths.some((ym) => sameMonth(ym, target))) return Promise.resolve();
    this.picks.set(monthKey(target), date);
    return this.go(target);
  }

  /** 화면이 보일 때(첫 진입·탭 복귀·포그라운드 복귀): 현재 달을 다시 계산하고(보던 달·날짜는 유지) 월 목록과 보이는 달을 재검증한다. 첫 진입이면 현재 달을 연다. 자정 감시를 시작한다. */
  onShown(): Promise<void> {
    if (this.isGuest) return Promise.resolve();
    if (this.visible) return this.opening ?? this.running;
    this.visible = true;
    this.midnight.start();
    // 마운트 직후 applyRoute가 시작한 첫 열기가 아직 유효하면 그대로 기다린다(같은 요청을 두 번 보내지 않는다).
    if (this.opening) return this.opening;
    this.syncClock();
    if (!this.started) return this.open(null);
    const month = this.state.month;
    return Promise.all([this.loadMonths(), this.go(month)]).then(() => undefined);
  }

  /** 화면 이탈·문서 숨김: 진행 중 요청을 취소하고 자정 감시를 멈춘다. 첫 조회가 취소돼도 오류가 아니다. */
  onHidden(): void {
    this.visible = false;
    this.midnight.stop();
    this.lifeGuard.invalidate();
    this.abortReads();
    this.opening = null;
  }

  /** 이전 달(선택지에서 한 칸 오래된 달). 가장 오래된 달이면 아무 일도 없다. */
  selectPreviousMonth(): Promise<void> {
    const { availableMonths, month } = this.state;
    const target = availableMonths.find((ym) => compareMonths(ym, month) < 0);
    return this.moveTo(target);
  }

  /** 다음 달(선택지에서 한 칸 최신 달). 가장 최신 달이면 아무 일도 없다. */
  selectNextMonth(): Promise<void> {
    const { availableMonths, month } = this.state;
    const target = availableMonths.filter((ym) => compareMonths(ym, month) > 0).at(-1);
    return this.moveTo(target);
  }

  /** 월 선택. 보고 있는 달이거나 선택지에 없는 달이면 아무 일도 없다(REQ-REC-006). */
  selectMonth(ym: YearMonth): Promise<void> {
    return this.moveTo(this.state.availableMonths.find((option) => sameMonth(option, ym)));
  }

  /** 날짜 선택. 사진이 없는 날짜·다른 달의 날짜는 아무 일도 없다(REQ-REC-030). */
  selectDate(date: DateString): void {
    const { body, selectedDate, month } = this.state;
    if (body.status !== 'ready' || date === selectedDate) return;
    const post = body.posts.find((candidate) => candidate.topicDate === date);
    if (!post) return;
    this.picks.set(monthKey(month), date);
    this.setState({ selectedDate: date, selectedPost: post, pendingHintOpen: false });
  }

  /** 오류 화면의 다시 시도(첫 불러오기부터). */
  retry(): Promise<void> {
    if (this.isGuest) return Promise.resolve();
    const month = this.state.month;
    return Promise.all([this.loadMonths(), this.go(month)]).then(() => undefined);
  }

  /** 기록 탭 재선택: 보이는 달을 재검증한다(기존 내용 유지). */
  onTabReselect(): Promise<void> {
    if (this.isGuest) return Promise.resolve();
    if (!this.started) return this.opening ?? Promise.resolve();
    return this.go(this.state.month);
  }

  /** PENDING 배지 안내 풍선 열기/닫기. */
  togglePendingHint(): void {
    if (this.state.selectedPost?.status !== 'PENDING') return;
    this.setState({ pendingHintOpen: !this.state.pendingHintOpen });
  }

  /** "피드에서 보기": 선택한 APPROVED 사진을 내 게시물로 연다. PENDING·선택 없음이면 아무 일도 없다. */
  openFeed(): void {
    const post = this.state.selectedPost;
    if (post?.status !== 'APPROVED') return;
    this.deps.navigator.openFeed({ postId: post.postId, thumbnailImageUrl: post.thumbnailImageUrl });
  }

  /** "전시 보러가기": 선택한 APPROVED 사진의 topicDate로 전시를 연다. PENDING·선택 없음이면 아무 일도 없다. */
  openDisplay(): void {
    const post = this.state.selectedPost;
    if (post?.status !== 'APPROVED') return;
    this.deps.navigator.openDisplay(post.topicDate);
  }

  /**
   * "이미지로 저장": 보고 있는 달의 이미지 모델을 exporter로 PNG로 그려(시그니처·가로세로 검증) `chalkak-calendar-{yyyy-MM}.png`로 downloader에 넘기고 성공 토스트를 한 번 보인다.
   * 저장 중 호출은 무시한다. SaveDeniedError는 record.save.denied, 그 밖의 실패(렌더·PNG 검증·다운로드)는 record.save.fail 토스트. 앱은 멈추지 않는다.
   */
  async saveImage(): Promise<void> {
    const { body, month, saving } = this.state;
    if (saving || body.status !== 'ready') return;
    this.setState({ saving: true });
    try {
      const blob = await this.deps.exporter.render(buildCalendarImageModel(month, body.posts));
      const size = blob.type === 'image/png' ? await readPngSize(blob) : null;
      if (!size || size.width <= 0 || size.height <= 0) throw new Error('rendered image is not a valid PNG');
      await this.deps.downloader.download({ name: calendarFileName(month), blob });
      this.deps.toast.show(t('record.save.ok'));
    } catch (error) {
      this.deps.toast.show(error instanceof SaveDeniedError ? t('record.save.denied') : t('record.save.fail'));
    } finally {
      this.setState({ saving: false });
    }
  }

  /** 계정 전환·로그아웃: 월별 캐시·월 선택지·선택 날짜·진행 중 요청을 모두 버리고 처음 상태로 돌린다(보이는 중이면 곧바로 다시 불러온다). */
  resetForAccountChange(): void {
    this.accountGuard.invalidate();
    this.navGuard.invalidate();
    this.abortReads();
    this.cache.clear();
    this.picks.clear();
    this.serverMonths = [];
    this.optionsReady = false;
    this.started = false;
    this.opening = null;
    this.running = Promise.resolve();
    this.replaceState(RecordViewModel.initialState(this.deps));
    if (this.visible && !this.isGuest) void this.open(null);
  }

  override dispose(): void {
    this.unsubscribeChanges();
    this.midnight.stop();
    this.accountGuard.invalidate();
    this.navGuard.invalidate();
    this.lifeGuard.invalidate();
    this.abortReads();
    super.dispose();
  }

  // ---------------------------------------------------------------- 열기·이동

  private moveTo(target: YearMonth | undefined): Promise<void> {
    if (this.isGuest || !target || sameMonth(target, this.state.month)) return Promise.resolve();
    return this.go(target);
  }

  /** 월 목록과 달을 연다. date가 있으면 월 목록을 읽은 뒤 선택지 안에 있을 때만 그 달·날짜를 연다(없으면 현재 달). */
  private open(date: DateString | null): Promise<void> {
    const life = this.lifeGuard.snapshot();
    const account = this.accountGuard.snapshot();
    this.syncClock();
    const mine = (async () => {
      if (date === null) {
        await Promise.all([this.loadMonths(), this.go(this.state.currentMonth)]);
        return;
      }
      await this.loadMonths();
      if (!life.isCurrent() || !account.isCurrent()) return;
      const target = monthOfDate(date);
      if (target && this.state.availableMonths.some((ym) => sameMonth(ym, target))) {
        this.picks.set(monthKey(target), date);
        await this.go(target);
      } else await this.go(this.state.currentMonth);
    })();
    const done = () => {
      if (this.opening === mine) this.opening = null;
    };
    void mine.then(done, done);
    this.opening = mine;
    return mine;
  }

  /** 그 달을 보여 준다: 캐시가 있으면 즉시 보이며 재검증, 없으면 로딩. */
  private go(ym: YearMonth): Promise<void> {
    this.started = true;
    const key = monthKey(ym);
    const nav = this.navGuard.begin();
    const account = this.accountGuard.snapshot();
    const cached = this.cache.has(key);
    this.show(ym, cached ? this.readyBody(key, true) : { status: 'loading' });
    this.running = this.load(ym, key, nav, account, cached);
    return this.running;
  }

  private async load(ym: YearMonth, key: string, nav: ReturnType<StaleGuard['begin']>, account: ReturnType<StaleGuard['begin']>, cached: boolean): Promise<void> {
    try {
      await this.readMonth(ym, key);
    } catch (error) {
      if (!account.isCurrent() || !nav.isCurrent()) return;
      if (isAbandoned(error)) {
        if (cached) this.show(ym, this.readyBody(key, false));
        return;
      }
      if (cached) {
        this.deps.toast.show(error instanceof NetworkError ? t('common.error.network') : t('record.err.other'));
        this.show(ym, this.readyBody(key, false));
      } else this.show(ym, { status: 'error', kind: errorKindOf(error) });
      return;
    }
    if (!account.isCurrent() || !nav.isCurrent()) return;
    // 새 응답에 지정·선택했던 날짜의 사진이 없으면 그 기억을 버리고 기본 선택을 따른다.
    const pick = this.picks.get(key);
    if (pick !== undefined && !this.postsOf(key).some((post) => post.topicDate === pick)) this.picks.delete(key);
    this.show(ym, this.readyBody(key, false));
  }

  /** 달 응답을 읽어 캐시에 남긴다(보고 있는 달이 아니어도). 같은 달의 진행 중 읽기는 공유한다. */
  private readMonth(ym: YearMonth, key: string): Promise<void> {
    const existing = this.reads.get(key);
    if (existing) return existing;
    const account = this.accountGuard.snapshot();
    const controller = new AbortController();
    this.controllers.add(controller);
    const read = (async () => {
      const month = await this.deps.repository.fetchMonth(ym, controller.signal);
      if (account.isCurrent()) this.cache.set(key, month.posts);
    })();
    const done = () => {
      this.controllers.delete(controller);
      if (this.reads.get(key) === read) this.reads.delete(key);
    };
    void read.then(done, done);
    this.reads.set(key, read);
    return read;
  }

  /** 월 목록을 읽는다. 실패는 조용히 넘기고(처음이면 현재 달만으로 진행) 이전 목록이 있으면 유지한다(REQ-REC-008). */
  private loadMonths(): Promise<void> {
    if (this.monthsRead) return this.monthsRead;
    const account = this.accountGuard.snapshot();
    const controller = new AbortController();
    this.controllers.add(controller);
    const read = (async () => {
      try {
        const months = await this.deps.repository.fetchMonths(controller.signal);
        if (!account.isCurrent()) return;
        this.serverMonths = months;
        this.optionsReady = true;
        this.refreshOptions();
      } catch (error) {
        if (!account.isCurrent() || isAbandoned(error)) return;
        this.optionsReady = true;
        this.refreshOptions();
      }
    })();
    const done = () => {
      this.controllers.delete(controller);
      if (this.monthsRead === read) this.monthsRead = null;
    };
    void read.then(done, done);
    this.monthsRead = read;
    return read;
  }

  private abortReads(): void {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.reads.clear();
    this.monthsRead = null;
  }

  // ---------------------------------------------------------------- 시계·이벤트

  /** KST 오늘·현재 달을 다시 계산한다(보던 달·날짜는 그대로). */
  private syncClock(): void {
    this.setState({ today: kstToday(this.deps.clock), currentMonth: currentYearMonth(this.deps.clock) });
    this.refreshOptions();
  }

  private onDateChanged(): void {
    if (!this.visible) return;
    this.syncClock();
  }

  private applyChange(change: PostChange): void {
    if (this.isGuest) return;
    if (change.type === 'removed') {
      // 캐시는 원본을 두고 보여 줄 때 거르므로 보이는 달만 다시 그리면 된다.
      const { body, month } = this.state;
      if (body.status === 'ready') this.show(month, this.readyBody(monthKey(month), body.revalidating));
      return;
    }
    if (change.type !== 'created') return;
    const ym = monthOfDate(change.topicDate);
    if (!ym) return;
    if (this.visible && this.started && sameMonth(ym, this.state.month)) {
      // 보이는 달: 목록을 그대로 둔 채 조용히 다시 불러온다.
      void this.go(ym);
      return;
    }
    this.cache.delete(monthKey(ym));
  }

  // ---------------------------------------------------------------- 상태 만들기

  private refreshOptions(): void {
    if (!this.optionsReady) return;
    const availableMonths = mergeAvailableMonths(this.serverMonths, this.state.currentMonth);
    const same = availableMonths.length === this.state.availableMonths.length && availableMonths.every((ym, index) => sameMonth(ym, this.state.availableMonths[index]!));
    this.setState({ ...(same ? {} : { availableMonths }), ...this.navFlags(same ? this.state.availableMonths : availableMonths, this.state.month) });
  }

  private navFlags(options: readonly YearMonth[], month: YearMonth): Pick<RecordState, 'canGoPrevious' | 'canGoNext'> {
    return { canGoPrevious: options.some((ym) => compareMonths(ym, month) < 0), canGoNext: options.some((ym) => compareMonths(ym, month) > 0) };
  }

  private postsOf(key: string): CalendarPost[] {
    return (this.cache.get(key) ?? []).filter((post) => !this.deps.changes.wasRemoved(post.postId));
  }

  private readyBody(key: string, revalidating: boolean): RecordBody {
    return { status: 'ready', posts: this.postsOf(key), revalidating };
  }

  /** 달과 본문을 게시한다. 선택 날짜는 고른 날짜가 아직 있으면 유지, 아니면 그 달에서 가장 늦은 사진의 날짜다. */
  private show(ym: YearMonth, body: RecordBody): void {
    const posts = body.status === 'ready' ? body.posts : [];
    const pick = this.picks.get(monthKey(ym));
    const selectedPost = (pick === undefined ? undefined : posts.find((post) => post.topicDate === pick)) ?? posts.at(-1) ?? null;
    const sameSelection = selectedPost?.postId !== undefined && selectedPost.postId === this.state.selectedPost?.postId;
    this.setState({
      month: ym,
      body,
      selectedDate: selectedPost?.topicDate ?? null,
      selectedPost,
      pendingHintOpen: sameSelection ? this.state.pendingHintOpen : false,
      ...this.navFlags(this.state.availableMonths, ym),
    });
  }
}
