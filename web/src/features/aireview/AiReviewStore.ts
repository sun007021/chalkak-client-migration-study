import { AI_REVIEW_POLL_INTERVAL_MS, AI_REVIEW_POLL_WINDOW_MS } from '../../constants';
import { t } from '../../copy/ko';
import { ApiError, NetworkError, SessionChangedError, isCancellation } from '../../core/net/errors';
import type { Clock } from '../../core/time/Clock';
import type { ToastController } from '../../core/ui/ToastController';
import type { AiReview, AiReviewEntry } from './aiReviewModels';
import type { AiReviewRepository } from './AiReviewRepository';

export interface AiReviewStoreDeps {
  repository: AiReviewRepository;
  /** 폴링 간격은 clock.sleep, 창은 monotonicMs로 잰다(Date.now·setTimeout 금지). */
  clock: Clock;
  /** 요청·폴링 오류 문구(`ai.error.*`)를 토스트로 알린다. */
  toast: ToastController;
}

export interface AiWatchOptions {
  /**
   * 화면이 다시 보일 때 COMPLETED 결과도 GET으로 갱신할지. 상세는 true(REQ-AIR-051: 재진입하면 완료 결과도 갱신),
   * 홈은 false(같은 게시물의 완료 결과는 다시 조회하지 않고 유지, TC-AIR-018). 처리 중·NONE·FAILED는 어느 쪽이든 GET부터 다시 시작한다.
   */
  refreshCompleted: boolean;
  /** 요청 자격(내 게시물 + 주제 날짜가 KST 오늘). request() 시점에 다시 평가해 false면 POST를 보내지 않는다(REQ-AIR-003). 기본 () => true. */
  canRequest?: () => boolean;
  /**
   * 조회(GET: show·recheck·폴링) 실패를 토스트로 알리지 않는다(홈 카드: 실패하면 카드만 숨긴다, REQ-HOME-035). 요청(POST) 오류 안내는 영향이 없다.
   * 폴링 오류는 보이는 손잡이가 모두 조용할 때만 생략한다.
   */
  quietReads?: boolean;
}

/**
 * 한 화면(홈 카드 또는 상세 알약)이 한 게시물을 보는 손잡이. 같은 postId를 여러 화면이 동시에 붙잡아도 상태·폴링은 저장소의 게시물 하나가 공유한다.
 * 폴링은 보이는(show 된) 손잡이가 하나라도 있는 동안만 돈다.
 */
export interface AiReviewWatch {
  readonly postId: string;
  /**
   * 화면이 보인다(처음 붙을 때 포함). GET부터 보내고 응답이 반영되면 이행한다(폴링 루프는 기다리지 않는다).
   * 응답이 PROCESSING이면 이 시각부터 새 300초 창으로 3초 간격 폴링을 시작한다(REQ-AIR-026, 028).
   * 이미 보이는 상태에서 다시 부르면 아무 일도 없다. 404면 phase=hidden(메시지 없음), 오류면 첫 확인 전이면 check-failed + 토스트(이전 상태가 있으면 유지 + 토스트).
   */
  show(): Promise<void>;
  /** 화면이 가려진다(다른 화면·탭·백그라운드). 마지막 보이는 손잡이가 가려지면 폴링을 멈추고 진행 중이던 GET·POST 응답을 버린다(requesting도 false로). */
  hide(): void;
  /** "AI 상태 다시 확인": GET 1회. PROCESSING이면 새 300초 창으로 폴링을 재개한다(TC-AIR-037). 이전에 보낸 GET(폴링 포함)이 아직 진행 중이면 그 응답은 버린다(TC-AIR-043: 완료 결과를 덮지 않는다). */
  recheck(): Promise<void>;
  /**
   * POST 1회(본문 없음, 자동 재전송 없음). status가 NONE이거나 FAILED+canRequestAgain이고 canRequest()가 true이며 requesting·blocked가 아닐 때만 보낸다(그 밖에는 아무 일도 없다).
   * POST 응답이 반영되면(오류 뒤 GET 동기화가 있으면 그 GET까지) 이행한다. 폴링 루프는 기다리지 않는다. PROCESSING → 이번 POST 시각부터 새 창으로 폴링(보이는 상태일 때), COMPLETED/FAILED → 그 상태(폴링 없음, 시트는 열지 않음).
   * 오류: 400 → 서버 message 토스트(상태 유지), 403 → `ai.error.banned` + blocked, 404 → hidden + `ai.error.not-found`, 401 → `ai.error.login`,
   * 연결 오류 → `ai.error.network` 후 GET 동기화, 5xx·검증 실패 → `ai.error.load` 후 GET 동기화(둘 다 POST 재전송 없음), 409 → 토스트 없이 GET 동기화.
   */
  request(): Promise<void>;
  /** 손잡이를 놓는다(hide 포함). 마지막 손잡이여도 게시물 상태는 캐시로 남는다. */
  release(): void;
}

/**
 * AI 피드백 공용 저장소(Android AiReviewSession 방식, 홈 카드·상세 알약 공용). 계정 전환 때 UserCaches가 reset한다.
 * 게시물마다 AiReviewEntry 하나를 갖고, 화면은 watch()로 붙어 show/hide로 가시성을 알린다.
 * 늦게 도착한 응답(화면 이탈 뒤, 수동 갱신 뒤의 이전 폴링, 다른 게시물, reset 뒤)은 상태를 바꾸지 않는다(StaleGuard).
 * 폴링: 3초 간격(`AI_REVIEW_POLL_INTERVAL_MS`), 창 300초(`AI_REVIEW_POLL_WINDOW_MS`), 창 시작 후 경과가 300초 이상이면 GET 없이 stalled(PROCESSING 유지) + 안내.
 * 동시에 두 GET을 보내지 않는다. 폴링 GET 일시 오류는 계속 폴링하고 토스트는 한 번만, 404는 hidden으로 멈추고 메시지 없음, 401은 멈추고 `ai.error.login`.
 */
/** 폴링 한 번(창)의 상태. alive가 false가 되면 루프는 다음 확인 지점에서 끝난다. */
interface PollRun {
  alive: boolean;
  startMs: number;
  abort: AbortController;
  /** 이 창에서 오류 토스트를 이미 보였다(폴링 오류는 창마다 1회). */
  toasted: boolean;
}

/** 게시물 하나의 내부 상태. 계정 전환(reset)이면 dead가 되어 늦은 응답이 모두 버려진다. */
interface Slot {
  postId: string;
  entry: AiReviewEntry | null;
  visible: Set<AiReviewWatch>;
  options: Map<AiReviewWatch, AiWatchOptions>;
  dead: boolean;
  /** 마지막 보이는 손잡이가 가려질 때마다 올린다. 그 전에 시작한 요청은 응답을 버린다. */
  epoch: number;
  getSeq: number;
  getAbort: AbortController | null;
  /** POST의 시작·끝마다 올린다. 그보다 먼저 시작한 GET 응답이 POST 결과를 덮지 않게 한다. */
  mutationSeq: number;
  postAbort: AbortController | null;
  poll: PollRun | null;
}

interface Ticket {
  valid(): boolean;
  signal: AbortSignal;
}

const POLL_STEPS = AI_REVIEW_POLL_WINDOW_MS / AI_REVIEW_POLL_INTERVAL_MS;

function initialEntry(postId: string): AiReviewEntry {
  return { postId, phase: 'checking', status: null, canRequestAgain: false, result: null, requesting: false, blocked: false, stalled: false, polling: false };
}

/**
 * AI 피드백 공용 저장소(Android AiReviewSession 방식, 홈 카드·상세 알약 공용). 계정 전환 때 UserCaches가 reset한다.
 * 게시물마다 AiReviewEntry 하나를 갖고, 화면은 watch()로 붙어 show/hide로 가시성을 알린다.
 * 늦게 도착한 응답(화면 이탈 뒤, 수동 갱신 뒤의 이전 폴링, 다른 게시물, reset 뒤)은 상태를 바꾸지 않는다.
 * 폴링: 3초 간격(`AI_REVIEW_POLL_INTERVAL_MS`), 창 300초(`AI_REVIEW_POLL_WINDOW_MS`), 창 시작 후 경과가 300초 이상이면 GET 없이 stalled(PROCESSING 유지) + 안내.
 * 동시에 두 GET을 보내지 않는다. 폴링 GET 일시 오류는 계속 폴링하고 토스트는 한 번만, 404는 hidden으로 멈추고 메시지 없음, 401은 멈추고 `ai.error.login`.
 */
export class AiReviewStore {
  private slots = new Map<string, Slot>();
  private readonly listeners = new Set<() => void>();

  constructor(protected readonly deps: AiReviewStoreDeps) {}

  /** 게시물의 현재 상태. 한 번도 붙은 적이 없으면 null. 같은 상태면 같은 참조를 돌려준다(useSyncExternalStore용). */
  entry(postId: string): AiReviewEntry | null {
    return this.slots.get(postId)?.entry ?? null;
  }

  /** 어느 게시물이든 상태가 바뀔 때 부른다. 해제 함수를 돌려준다. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  watch(postId: string, options: AiWatchOptions): AiReviewWatch {
    const watch: AiReviewWatch = {
      postId,
      show: () => this.show(watch, options),
      hide: () => this.hide(watch),
      recheck: () => this.recheck(watch, options),
      request: () => this.request(watch, options),
      release: () => {
        this.hide(watch);
        this.slots.get(postId)?.options.delete(watch);
      },
    };
    return watch;
  }

  /** 계정 전환·로그아웃: 모든 상태를 지우고 폴링을 멈추며 진행 중 응답을 버린다. 이미 만든 손잡이는 다시 show하면 새로 시작한다. */
  reset(): void {
    const slots = [...this.slots.values()];
    this.slots = new Map();
    for (const slot of slots) {
      slot.dead = true;
      this.cancelInFlight(slot);
    }
    this.notify();
  }

  // ---------------------------------------------------------------- 내부

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private slotFor(postId: string): Slot {
    let slot = this.slots.get(postId);
    if (!slot) {
      slot = { postId, entry: null, visible: new Set(), options: new Map(), dead: false, epoch: 0, getSeq: 0, getAbort: null, mutationSeq: 0, postAbort: null, poll: null };
      this.slots.set(postId, slot);
    }
    return slot;
  }

  /** 항목을 바꾼다(polling은 slot.poll에서 다시 계산). 값이 하나도 안 바뀌면 같은 참조를 유지하고 알리지 않는다. */
  private commit(slot: Slot, patch: Partial<AiReviewEntry> = {}): void {
    const base = slot.entry ?? initialEntry(slot.postId);
    const next: AiReviewEntry = { ...base, ...patch, polling: slot.poll !== null };
    const keys = Object.keys(next) as (keyof AiReviewEntry)[];
    if (slot.entry && keys.every((key) => Object.is(next[key], slot.entry![key]))) return;
    slot.entry = next;
    this.notify();
  }

  private stopPolling(slot: Slot): void {
    if (!slot.poll) return;
    slot.poll.alive = false;
    slot.poll.abort.abort();
    slot.poll = null;
  }

  private cancelInFlight(slot: Slot): void {
    this.stopPolling(slot);
    slot.getSeq += 1;
    slot.getAbort?.abort();
    slot.getAbort = null;
    slot.postAbort?.abort();
    slot.postAbort = null;
  }

  private beginGet(slot: Slot): Ticket {
    slot.getAbort?.abort();
    const abort = new AbortController();
    slot.getAbort = abort;
    const seq = ++slot.getSeq;
    const { epoch, mutationSeq } = slot;
    return { signal: abort.signal, valid: () => !slot.dead && slot.epoch === epoch && slot.getSeq === seq && slot.mutationSeq === mutationSeq };
  }

  private isVisible(slot: Slot): boolean {
    return slot.visible.size > 0;
  }

  private newRun(slot: Slot, startMs: number): PollRun {
    this.stopPolling(slot);
    const run: PollRun = { alive: true, startMs, abort: new AbortController(), toasted: false };
    slot.poll = run;
    return run;
  }

  /** 응답(GET·POST 공통)을 항목에 반영한다. PROCESSING이고 보이는 손잡이가 있으면 새 창으로 폴링을 시작한다. */
  private applyReview(slot: Slot, review: AiReview, windowStartMs: number, extra: Partial<AiReviewEntry> = {}): void {
    const poll = review.status === 'PROCESSING' && this.isVisible(slot);
    const run = poll ? this.newRun(slot, windowStartMs) : (this.stopPolling(slot), null);
    this.commit(slot, { phase: 'ready', status: review.status, canRequestAgain: review.canRequestAgain, result: review.result, stalled: false, ...extra });
    if (run) void this.runPoll(slot, run);
  }

  private toastFor(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) this.deps.toast.show(t('ai.error.login'));
    else if (error instanceof NetworkError) this.deps.toast.show(t('ai.error.network'));
    else if (!(error instanceof SessionChangedError)) this.deps.toast.show(t('ai.error.load'));
  }

  /**
   * GET 한 번을 보내 항목에 반영한다(show·recheck·POST 뒤 동기화 공용). 진행 중이던 폴링과 GET은 버린다.
   * 실패하면 첫 확인 전이면 check-failed, 이미 상태가 있으면 유지하고, 둘 다 토스트(silent이면 생략). 이전이 PROCESSING이고 보이면 폴링은 이어 간다.
   */
  private async refresh(slot: Slot, silent = false): Promise<void> {
    this.stopPolling(slot);
    const ticket = this.beginGet(slot);
    let review: AiReview;
    try {
      review = await this.deps.repository.fetchReview(slot.postId, ticket.signal);
    } catch (error) {
      if (isCancellation(error) || !ticket.valid()) return;
      if (error instanceof ApiError && error.status === 404) {
        this.commit(slot, { phase: 'hidden', status: null, canRequestAgain: false, result: null, stalled: false });
        return;
      }
      if (!silent) this.toastFor(error);
      const entry = slot.entry;
      if (entry?.status === 'PROCESSING' && this.isVisible(slot) && !(error instanceof ApiError && error.status === 401)) {
        const run = this.newRun(slot, this.deps.clock.monotonicMs());
        this.commit(slot);
        void this.runPoll(slot, run);
        return;
      }
      this.commit(slot, entry && entry.phase !== 'checking' ? {} : { phase: 'check-failed' });
      return;
    }
    if (!ticket.valid()) return;
    this.applyReview(slot, review, this.deps.clock.monotonicMs());
  }

  private async runPoll(slot: Slot, run: PollRun): Promise<void> {
    const { clock } = this.deps;
    let step = 1;
    while (run.alive) {
      const target = run.startMs + step * AI_REVIEW_POLL_INTERVAL_MS;
      try {
        await clock.sleep(Math.max(0, target - clock.monotonicMs()), run.abort.signal);
      } catch {
        return;
      }
      if (!run.alive) return;
      if (step >= POLL_STEPS) {
        slot.poll = null;
        this.commit(slot, { stalled: true });
        return;
      }
      await this.pollOnce(slot, run);
      const elapsedSteps = Math.floor((clock.monotonicMs() - run.startMs) / AI_REVIEW_POLL_INTERVAL_MS);
      step = Math.min(Math.max(step + 1, elapsedSteps + 1), POLL_STEPS);
    }
  }

  private async pollOnce(slot: Slot, run: PollRun): Promise<void> {
    const ticket = this.beginGet(slot);
    let review: AiReview;
    try {
      review = await this.deps.repository.fetchReview(slot.postId, ticket.signal);
    } catch (error) {
      if (isCancellation(error) || !run.alive || !ticket.valid()) return;
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) {
        this.stopPolling(slot);
        if (error.status === 404) this.commit(slot, { phase: 'hidden', status: null, canRequestAgain: false, result: null, stalled: false });
        else {
          this.deps.toast.show(t('ai.error.login'));
          this.commit(slot);
        }
        return;
      }
      if (error instanceof SessionChangedError) {
        this.stopPolling(slot);
        this.commit(slot);
        return;
      }
      if (!run.toasted) {
        run.toasted = true;
        const quiet = [...slot.visible].every((watch) => slot.options.get(watch)?.quietReads === true);
        if (!quiet) this.toastFor(error);
      }
      return;
    }
    if (!run.alive || !ticket.valid()) return;
    if (review.status === 'PROCESSING') {
      this.commit(slot, { phase: 'ready', status: review.status, canRequestAgain: review.canRequestAgain, result: null });
      return;
    }
    this.applyReview(slot, review, this.deps.clock.monotonicMs());
  }

  // ---------------------------------------------------------------- 손잡이 동작

  private async show(watch: AiReviewWatch, options: AiWatchOptions): Promise<void> {
    const slot = this.slotFor(watch.postId);
    slot.options.set(watch, options);
    if (slot.visible.has(watch)) return;
    slot.visible.add(watch);
    if (!slot.entry) this.commit(slot);
    const entry = slot.entry!;
    if (!options.refreshCompleted && entry.phase === 'ready' && entry.status === 'COMPLETED') return;
    await this.refresh(slot, options.quietReads === true);
  }

  private hide(watch: AiReviewWatch): void {
    const slot = this.slots.get(watch.postId);
    if (!slot || !slot.visible.delete(watch)) return;
    if (slot.visible.size > 0) return;
    slot.epoch += 1;
    this.cancelInFlight(slot);
    if (slot.entry) this.commit(slot, { requesting: false, stalled: false });
  }

  private async recheck(watch: AiReviewWatch, options: AiWatchOptions): Promise<void> {
    const slot = this.slotFor(watch.postId);
    slot.options.set(watch, options);
    if (!slot.entry) this.commit(slot);
    await this.refresh(slot, options.quietReads === true);
  }

  private async request(watch: AiReviewWatch, options: AiWatchOptions): Promise<void> {
    const slot = this.slots.get(watch.postId);
    const entry = slot?.entry;
    if (!slot || !entry || entry.phase !== 'ready' || entry.requesting || entry.blocked) return;
    if (!(entry.status === 'NONE' || (entry.status === 'FAILED' && entry.canRequestAgain))) return;
    if (options.canRequest && !options.canRequest()) return;

    const startMs = this.deps.clock.monotonicMs();
    const abort = new AbortController();
    slot.postAbort = abort;
    slot.mutationSeq += 1;
    const { epoch } = slot;
    const current = () => !slot.dead && slot.epoch === epoch;
    this.commit(slot, { requesting: true });
    let review: AiReview;
    try {
      review = await this.deps.repository.requestReview(watch.postId, abort.signal);
    } catch (error) {
      if (isCancellation(error) || !current()) return;
      slot.mutationSeq += 1;
      await this.afterRequestError(slot, error, current);
      return;
    }
    if (!current()) return;
    slot.mutationSeq += 1;
    this.applyReview(slot, review, startMs, { requesting: false });
  }

  private async afterRequestError(slot: Slot, error: unknown, current: () => boolean): Promise<void> {
    const toast = (message: string) => this.deps.toast.show(message);
    if (error instanceof ApiError) {
      if (error.status === 400) {
        toast(error.message || t('ai.error.load'));
        this.commit(slot, { requesting: false });
        return;
      }
      if (error.status === 403) {
        toast(t('ai.error.banned'));
        this.commit(slot, { requesting: false, blocked: true });
        return;
      }
      if (error.status === 404) {
        toast(t('ai.error.not-found'));
        this.stopPolling(slot);
        this.commit(slot, { requesting: false, phase: 'hidden', status: null, canRequestAgain: false, result: null, stalled: false });
        return;
      }
      if (error.status === 401) {
        toast(t('ai.error.login'));
        this.commit(slot, { requesting: false });
        return;
      }
    }
    if (error instanceof SessionChangedError) {
      this.commit(slot, { requesting: false });
      return;
    }
    // 연결 실패·5xx·검증 실패·409: 서버가 요청을 받았을 수 있으니 POST는 다시 보내지 않고 GET으로 맞춘다.
    const conflict = error instanceof ApiError && error.status === 409;
    if (!conflict) toast(error instanceof NetworkError ? t('ai.error.network') : t('ai.error.load'));
    await this.refresh(slot, true);
    if (current()) this.commit(slot, { requesting: false });
  }
}
