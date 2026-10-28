import { CancelledError, HttpError, NetworkError } from '../../core/http/ApiError';
import type { Sleeper } from '../../core/http/Sleeper';
import type { SessionStore } from '../../core/session/SessionStore';
import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { AiReview } from '../../data/ai-review/AiReviewModels';
import type { AiReviewApi } from '../../data/ai-review/AiReviewRepository';
import { AI_REVIEW_POLL_INTERVAL_MS, AI_REVIEW_POLL_WINDOW_MS } from '../../shared/constants';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { AiReviewSession, AiReviewState } from './AiReviewSession';

export type AiReviewPollerDeps = {
  reviews: AiReviewApi;
  clock: Clock;
  /** 폴링 간격 대기용. 테스트는 시계와 함께 흐르는 가짜를 넣는다. */
  sleeper: Sleeper;
  /** 요청 시작과 응답 도착 사이에 계정이 바뀌었는지 보는 용도. */
  session: Pick<SessionStore, 'generation'>;
  toast: ToastPresenter;
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
  intervalMs?: number;
  windowMs?: number;
};

const IDLE: AiReviewState = {
  postId: null,
  phase: 'idle',
  requesting: false,
  review: null,
  stalled: false,
};

/** 한 번의 조회·폴링·POST 단위. 새로 시작하거나 멈추면 이전 단위는 무효가 된다. */
type Run = { id: number; controller: AbortController; sessionGeneration: number };

/**
 * AI 피드백 상태 확인·폴링·요청(D-03). 앱에 하나이고 화면은 보이는 동안만 게시물 하나를 맡긴다.
 * 폴링: 첫 GET은 바로, 이후 intervalMs 간격, 창 시작(시작 또는 POST를 보낸 시각)부터 windowMs가 지나면 GET 없이 멈추고 stalled로 둔다.
 * 응답은 같은 단위·같은 계정일 때만 반영한다.
 */
export class DefaultAiReviewPoller
  extends Observable<AiReviewState>
  implements AiReviewSession, UserDataCache
{
  private run: Run | null = null;
  /** 지금 GET/대기 루프가 돌고 있는 단위(끝나면 null). */
  private looping: Run | null = null;
  private runCounter = 0;
  private readonly authErrors: AuthErrorPolicy;
  private readonly intervalMs: number;
  private readonly windowMs: number;
  /** 이 단위에서 폴링 오류 문구를 이미 보였는가(한 번만). */
  private pollErrorShown = false;

  constructor(private readonly deps: AiReviewPollerDeps) {
    super(IDLE);
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
    this.intervalMs = deps.intervalMs ?? AI_REVIEW_POLL_INTERVAL_MS;
    this.windowMs = deps.windowMs ?? AI_REVIEW_POLL_WINDOW_MS;
  }

  start(postId: string): void {
    const s = this.getSnapshot();
    if (s.postId === postId && s.review?.status === 'COMPLETED') {
      // 같은 게시물의 완료 결과는 다시 조회하지 않고 유지한다(REQ-AIR-051).
      this.cancel();
      return;
    }
    // 홈 ViewModel과 카드가 같은 게시물로 연달아 불러도 이미 도는 루프를 다시 시작하지 않는다.
    if (this.looping !== null && this.looping === this.run && s.postId === postId) return;
    this.begin(postId);
  }

  refresh(postId: string): void {
    this.begin(postId);
  }

  stop(): void {
    this.cancel();
  }

  /** UserDataCache: 계정 전환·로그아웃 때 진행 중 요청과 값을 버린다. */
  clearAll(): void {
    this.cancel();
    this.update(IDLE);
  }

  override dispose(): void {
    this.cancel();
    super.dispose();
  }

  async request(postId: string): Promise<void> {
    if (this.getSnapshot().requesting) return;
    const run = this.newRun();
    const s = this.getSnapshot();
    this.update({
      ...s,
      postId,
      review: s.postId === postId ? s.review : null,
      requesting: true,
      stalled: false,
    });
    const sentAt = this.deps.clock.now().getTime();
    try {
      const review = await this.deps.reviews.request(postId, run.controller.signal);
      if (!this.isCurrent(run)) return this.releaseRequesting(run);
      this.update({ ...this.getSnapshot(), requesting: false, phase: 'ready', review });
      if (review.status === 'PROCESSING') void this.loop(run, postId, sentAt, false);
    } catch (error) {
      if (!this.isCurrent(run)) return this.releaseRequesting(run);
      this.update({ ...this.getSnapshot(), requesting: false });
      this.onRequestError(error, postId);
    }
  }

  // ---- 내부 ----

  private begin(postId: string): void {
    const run = this.newRun();
    const s = this.getSnapshot();
    const same = s.postId === postId;
    this.pollErrorShown = false;
    this.update({
      postId,
      phase: 'checking',
      requesting: false,
      review: same ? s.review : null,
      stalled: false,
    });
    void this.loop(run, postId, this.deps.clock.now().getTime(), true);
  }

  private newRun(): Run {
    this.cancel();
    const run: Run = {
      id: ++this.runCounter,
      controller: new AbortController(),
      sessionGeneration: this.deps.session.generation(),
    };
    this.run = run;
    return run;
  }

  private cancel(): void {
    this.run?.controller.abort();
    this.run = null;
  }

  private isCurrent(run: Run): boolean {
    return this.run === run && this.deps.session.generation() === run.sessionGeneration;
  }

  /** 취소로 끝난 POST가 남긴 requesting 표시를 푼다(새 단위가 이미 다시 올렸다면 건드리지 않는다). */
  private releaseRequesting(run: Run): void {
    if (this.run === null || this.run.id < run.id) {
      if (this.getSnapshot().requesting) this.update({ ...this.getSnapshot(), requesting: false });
    }
  }

  private async loop(
    run: Run,
    postId: string,
    windowStartMs: number,
    immediate: boolean,
  ): Promise<void> {
    this.looping = run;
    try {
      await this.pollUntilDone(run, postId, windowStartMs, immediate);
    } finally {
      if (this.looping === run) this.looping = null;
    }
  }

  private async pollUntilDone(
    run: Run,
    postId: string,
    windowStartMs: number,
    immediate: boolean,
  ): Promise<void> {
    let now = immediate;
    for (;;) {
      if (!now) {
        try {
          await this.deps.sleeper.sleep(this.intervalMs, run.controller.signal);
        } catch (error) {
          if (error instanceof CancelledError) return;
          throw error;
        }
        if (!this.isCurrent(run)) return;
        if (this.deps.clock.now().getTime() - windowStartMs >= this.windowMs) {
          this.update({ ...this.getSnapshot(), stalled: true });
          return;
        }
      }
      now = false;
      let review: AiReview;
      try {
        review = await this.deps.reviews.get(postId, run.controller.signal);
      } catch (error) {
        if (!this.isCurrent(run) || error instanceof CancelledError) return;
        if (!this.onPollError(error, postId)) return;
        continue;
      }
      if (!this.isCurrent(run)) return;
      this.update({ ...this.getSnapshot(), phase: 'ready', review });
      if (review.status !== 'PROCESSING') return;
    }
  }

  /** GET 오류. 폴링을 이어가야 하면 true. */
  private onPollError(error: unknown, postId: string): boolean {
    if (this.authErrors.handle(error, postId)) {
      this.settleAfterError();
      return false;
    }
    if (error instanceof HttpError && error.status === 404) {
      this.update({ ...this.getSnapshot(), phase: 'hidden' });
      return false;
    }
    const message = errorMessage(error);
    const s = this.getSnapshot();
    if (s.review === null) {
      // 처음 확인부터 실패: 다시 확인으로 재시도할 수 있게 둔다.
      this.update({ ...s, phase: 'check-failed' });
      this.deps.toast.show(message);
      return false;
    }
    this.settleAfterError();
    if (!this.pollErrorShown) {
      this.pollErrorShown = true;
      this.deps.toast.show(message);
    }
    return s.review.status === 'PROCESSING';
  }

  private settleAfterError(): void {
    const s = this.getSnapshot();
    if (s.phase === 'checking') this.update({ ...s, phase: s.review ? 'ready' : 'check-failed' });
  }

  private onRequestError(error: unknown, postId: string): void {
    if (this.authErrors.handle(error, postId)) return;
    if (error instanceof HttpError) {
      if (error.status === 404) {
        this.update({ ...this.getSnapshot(), phase: 'hidden' });
        this.deps.toast.show(t('ai.error.not-found'));
        return;
      }
      if (error.status === 403) {
        this.deps.toast.show(t('ai.error.banned'));
        return;
      }
      if (error.status === 400) {
        // 서버 message를 그대로 보여 주고 이전 단계를 유지한다. 자동 재요청은 없다.
        this.deps.toast.show(error.serverMessage ?? t('ai.error.load'));
        return;
      }
    }
    // 연결 오류·5xx·검증 실패: 접수됐을 수 있으니 POST는 다시 보내지 않고 GET으로 동기화한다.
    this.deps.toast.show(errorMessage(error));
    this.begin(postId);
  }

  /** 상태가 실제로 달라졌을 때만 알린다. */
  private update(next: AiReviewState): void {
    if (sameState(this.getSnapshot(), next)) return;
    this.setState(next);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof NetworkError ? t('ai.error.network') : t('ai.error.load');
}

function sameReview(a: AiReview | null, b: AiReview | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameState(a: AiReviewState, b: AiReviewState): boolean {
  return (
    a.postId === b.postId &&
    a.phase === b.phase &&
    a.requesting === b.requesting &&
    a.stalled === b.stalled &&
    sameReview(a.review, b.review)
  );
}
