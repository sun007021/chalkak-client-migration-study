import type { AppVisibility } from '../../core/lifecycle/AppVisibility';
import { Observable } from '../../core/state/Observable';
import type { Clock } from '../../core/time/Clock';
import type { KstDate } from '../../core/time/KstDate';
import { todayKst } from '../../core/time/kst';
import type { AiReview } from '../../data/ai-review/AiReviewModels';
import { format, t } from '../../shared/copy';
import type { AiReviewSession } from './AiReviewSession';
import type {
  AiCard,
  AiPill,
  AiPillKind,
  AiResultSheet,
  AiReviewViewState,
  AiSheet,
} from './AiReviewViewModelState';

export type AiReviewTarget = {
  postId: string;
  /** 상세 응답을 받기 전에는 null. 모르면 새 요청을 열지 않는다. */
  topicDate: KstDate | null;
  isMine: boolean;
};

export type AiReviewViewModelDeps = {
  target: AiReviewTarget;
  mode: 'member' | 'guest';
  /** feed: 상세의 알약과 시트 / home: 카드. 재요청 시트 여부와 재조회 정책이 다르다(REQ-AIR-036, 051). */
  surface: 'feed' | 'home';
  /** push: 푸시로 들어왔으니 최신 GET 결과 기준으로 시트를 한 번 자동으로 연다(D-11). */
  entry: 'normal' | 'push';
  clock: Clock;
  poller: AiReviewSession;
  visibility: AppVisibility;
};

type SheetRequest = null | 'start' | 'restart' | 'result' | 'failed';

const PILL_LABELS: Record<AiPillKind, Parameters<typeof t>[0]> = {
  checking: 'ai.pill.checking',
  request: 'ai.pill.request',
  requesting: 'ai.pill.requesting',
  processing: 'ai.pill.processing',
  view: 'ai.pill.view',
  retry: 'ai.pill.retry',
  failed: 'ai.pill.failed',
  recheck: 'ai.pill.recheck',
};

const DISABLED: readonly AiPillKind[] = ['checking', 'requesting', 'processing'];

/**
 * AI 피드백 알약·카드·시트 하나(게시물 하나)의 표시 상태. 상태 확인·폴링·POST는 폴러가 맡고
 * 이 ViewModel은 그 상태를 알약/카드/시트로 바꾸고 사용자의 탭을 폴러 호출로 옮긴다.
 * 소유자(상세 화면 또는 홈)가 만들고 dispose한다.
 */
export class AiReviewViewModel extends Observable<AiReviewViewState> {
  private sheetRequest: SheetRequest = null;
  /** 시트·다이얼로그·푸시 소비처럼 이 ViewModel이 바꾸는 입력의 변경 번호. */
  private revision = 0;
  private lastInputs: { poller: unknown; revision: number; today: string } | null = null;
  private criteriaDialogOpen = false;
  private shown = false;
  private pushPending: boolean;
  private stopPoller: (() => void) | null = null;
  private stopVisibility: (() => void) | null = null;

  constructor(private readonly deps: AiReviewViewModelDeps) {
    super(EMPTY);
    this.pushPending = deps.entry === 'push';
  }

  private get postId(): string {
    return this.deps.target.postId;
  }

  /** 내 게시물이고 회원일 때만 AI 피드백을 다룬다(REQ-AIR-001, 007). */
  private get active(): boolean {
    return this.deps.target.isMine && this.deps.mode === 'member';
  }

  /** 화면이 보인다: GET부터 확인한다(상세는 항상, 홈은 같은 게시물의 완료 결과를 유지). */
  async onShown(): Promise<void> {
    if (!this.active) return;
    this.shown = true;
    this.stopPoller ??= this.deps.poller.subscribe(() => this.onPollerChanged());
    this.stopVisibility ??= this.deps.visibility.subscribe((state) => {
      if (state === 'background') this.deps.poller.stop(this);
      else this.check();
    });
    this.check();
    this.recompute();
  }

  /** 화면 이탈: 폴링을 멈추고 이후 응답은 반영하지 않는다. 결과 상태는 지우지 않는다. */
  onHidden(): void {
    this.shown = false;
    this.stopPoller?.();
    this.stopPoller = null;
    this.stopVisibility?.();
    this.stopVisibility = null;
    if (this.active) this.deps.poller.stop(this);
  }

  override dispose(): void {
    this.onHidden();
    super.dispose();
  }

  onPillPress(): void {
    const pill = this.getSnapshot().pill;
    if (!pill?.enabled) return;
    switch (pill.kind) {
      case 'recheck':
        this.deps.poller.refresh(this.postId, this);
        return;
      case 'view':
        this.openSheet('result');
        return;
      case 'failed':
        this.openSheet('failed');
        return;
      case 'request':
      case 'retry':
        // 버튼을 보인 뒤 자정이 지났을 수 있다: 누른 시점에도 다시 확인한다(REQ-AIR-003).
        if (!this.canRequestNow()) {
          this.recompute();
          return;
        }
        this.openSheet(pill.kind === 'retry' ? 'restart' : 'start');
        return;
      default:
        return;
    }
  }

  /** 시작(재요청) 시트의 "분석 시작하기". */
  async confirmStart(): Promise<void> {
    if (this.sheetRequest !== 'start' && this.sheetRequest !== 'restart') return;
    this.sheetRequest = null;
    this.revision += 1;
    await this.requestNow();
  }

  dismissSheet(): void {
    this.sheetRequest = null;
    this.revision += 1;
    this.recompute();
  }

  /** 실패 시트(푸시 진입 등)의 재요청 버튼: 재요청 시트로 이어진다. */
  onFailedSheetRetry(): void {
    if (this.sheetRequest !== 'failed') return;
    if (!this.canRequestNow()) {
      this.dismissSheet();
      return;
    }
    this.openSheet('restart');
  }

  /** 폴링 창이 끝난 뒤 "AI 상태 다시 확인". */
  onRecheckPress(): void {
    this.deps.poller.refresh(this.postId, this);
  }

  openCriteriaDialog(): void {
    this.criteriaDialogOpen = true;
    this.revision += 1;
    this.recompute();
  }

  closeCriteriaDialog(): void {
    this.criteriaDialogOpen = false;
    this.revision += 1;
    this.recompute();
  }

  /** 홈 카드의 버튼. 실패 재요청은 시트 없이 바로 보낸다(REQ-AIR-036). */
  async onCardActionPress(): Promise<void> {
    const action = this.getSnapshot().card?.action;
    if (!action) return;
    if (action.kind === 'detail') this.openSheet('result');
    else if (action.kind === 'start') {
      if (this.canRequestNow()) this.openSheet('start');
      else this.recompute();
    } else await this.requestNow();
  }

  // ---- 내부 ----

  private check(): void {
    if (this.deps.surface === 'home') this.deps.poller.start(this.postId, this);
    else this.deps.poller.refresh(this.postId, this);
  }

  private async requestNow(): Promise<void> {
    if (!this.canRequestNow()) {
      this.recompute();
      return;
    }
    this.recompute();
    await this.deps.poller.request(this.postId, this);
  }

  private openSheet(kind: Exclude<SheetRequest, null>): void {
    this.sheetRequest = kind;
    this.revision += 1;
    this.recompute();
  }

  private onPollerChanged(): void {
    this.maybeOpenFromPush();
    this.recompute();
  }

  /** 푸시로 들어왔으면 최신 GET 결과가 확인된 첫 순간에 COMPLETED/FAILED 시트를 한 번만 연다. */
  private maybeOpenFromPush(): void {
    if (!this.pushPending) return;
    const s = this.deps.poller.getSnapshot();
    if (s.postId !== this.postId || s.phase === 'checking' || s.phase === 'idle') return;
    this.pushPending = false;
    if (s.phase !== 'ready' || !s.review) return;
    this.revision += 1;
    if (s.review.status === 'COMPLETED') this.sheetRequest = 'result';
    else if (s.review.status === 'FAILED') this.sheetRequest = 'failed';
  }

  /** 새 분석·재요청 자격: 내 게시물 + 주제 날짜가 KST 오늘(D-23). 지금 시계로 판정한다. */
  private canRequestNow(): boolean {
    const { topicDate } = this.deps.target;
    return this.active && topicDate !== null && topicDate.equals(todayKst(this.deps.clock));
  }

  /** 입력(폴러 상태, 이 ViewModel의 시트·다이얼로그, KST 오늘)이 달라졌을 때만 다시 만든다. */
  private recompute(): void {
    const key = {
      poller: this.deps.poller.getSnapshot(),
      revision: this.revision,
      today: todayKst(this.deps.clock).toString(),
    };
    const last = this.lastInputs;
    if (
      last &&
      last.poller === key.poller &&
      last.revision === key.revision &&
      last.today === key.today
    ) {
      return;
    }
    this.lastInputs = key;
    this.setState(this.build());
  }

  private build(): AiReviewViewState {
    const pill = this.buildPill();
    const poller = this.deps.poller.getSnapshot();
    const own = poller.postId === this.postId;
    return {
      pill: pill ? { ...pill, label: t(PILL_LABELS[pill.kind]) } : null,
      notice:
        pill && own && poller.stalled ? { message: t('ai.poll.timeout'), canRecheck: true } : null,
      sheet: this.buildSheet(),
      criteriaDialogOpen: this.criteriaDialogOpen,
      card: this.deps.surface === 'home' ? this.buildCard(pill?.kind ?? null) : null,
    };
  }

  private buildPill(): Omit<AiPill, 'label'> | null {
    if (!this.active) return null;
    const s = this.deps.poller.getSnapshot();
    if (s.postId !== this.postId || s.phase === 'idle' || s.phase === 'hidden') return null;
    const kind = this.pillKind(s.phase, s.requesting, s.review);
    return kind ? { kind, enabled: !DISABLED.includes(kind) } : null;
  }

  private pillKind(
    phase: 'checking' | 'check-failed' | 'ready',
    requesting: boolean,
    review: AiReview | null,
  ): AiPillKind | null {
    if (requesting) return 'requesting';
    if (phase === 'check-failed') return 'recheck';
    if (!review) return 'checking';
    switch (review.status) {
      case 'NONE':
        return this.canRequestNow() ? 'request' : null;
      case 'PROCESSING':
        return 'processing';
      case 'COMPLETED':
        return 'view';
      case 'FAILED':
        return review.canRequestAgain && this.canRequestNow() ? 'retry' : 'failed';
    }
  }

  private buildSheet(): AiSheet | null {
    const request = this.sheetRequest;
    const review = this.deps.poller.getSnapshot().review;
    if (request === 'start' || request === 'restart') {
      const retry = request === 'restart';
      return {
        kind: 'start',
        retry,
        title: t(retry ? 'ai.start.title-retry' : 'ai.start.title'),
        lines: [t('ai.start.line1'), t('ai.start.line2'), t('ai.start.line3')],
        confirmLabel: t('ai.start.confirm'),
      };
    }
    if (request === 'result' && review?.result) return resultSheet(review);
    if (request === 'failed' && review?.status === 'FAILED') {
      const canRetry = review.canRequestAgain && this.canRequestNow();
      return {
        kind: 'failed',
        title: t('ai.failed.title'),
        reason: canRetry
          ? null
          : t(review.canRequestAgain ? 'ai.failed.past' : 'ai.failed.no-more'),
        canRetry,
        confirmLabel: t('ai.failed.confirm'),
      };
    }
    return null;
  }

  private buildCard(kind: AiPillKind | null): AiCard | null {
    switch (kind) {
      case 'request':
        return {
          message: t('ai.card.request'),
          action: { kind: 'start', label: t('ai.card.request') },
        };
      case 'requesting':
      case 'processing':
        return { message: t('ai.card.processing'), action: null };
      case 'view':
        return {
          message: t('ai.card.completed'),
          action: { kind: 'detail', label: t('ai.card.detail') },
        };
      case 'retry':
        return {
          message: t('ai.card.failed'),
          action: { kind: 'retry', label: t('ai.card.retry') },
        };
      case 'failed':
        return { message: t('ai.card.failed'), action: null };
      default:
        return null;
    }
  }
}

const EMPTY: AiReviewViewState = {
  pill: null,
  notice: null,
  sheet: null,
  criteriaDialogOpen: false,
  card: null,
};

const scoreText = (score: number): string => score.toFixed(1);

function resultSheet(review: AiReview): AiResultSheet | null {
  const result = review.result;
  if (!result) return null;
  const overall = scoreText(result.overallScore);
  return {
    kind: 'result',
    scoreText: overall,
    scoreA11yLabel: format(t('ai.result.score-a11y'), { X: overall }),
    summary: result.feedback.summary,
    criteria: result.criteria.map((c) => ({
      key: c.key,
      label: c.label,
      scoreText: scoreText(c.score),
    })),
    distinctiveBadge: result.distinctivePerspective ? t('ai.result.distinctive') : null,
    sections: [
      { key: 'strength', title: t('ai.result.strength'), body: result.feedback.strength },
      { key: 'weakness', title: t('ai.result.weakness'), body: result.feedback.weakness },
      { key: 'suggestion', title: t('ai.result.suggestion'), body: result.feedback.suggestion },
    ],
  };
}
