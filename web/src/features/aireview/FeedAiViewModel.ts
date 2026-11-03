import type { Clock } from '../../core/time/Clock';
import { MidnightWatcher } from '../../core/time/MidnightWatcher';
import { kstToday } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { ToastController } from '../../core/ui/ToastController';
import { ViewModel } from '../../core/state/ViewModel';
import type { FeedAiState } from './aiReviewModels';
import { canRequestAi, deriveAiPill, failedSheetReason } from './aiPill';
import type { AiReviewStore, AiReviewWatch } from './AiReviewStore';

export interface FeedAiViewModelDeps {
  postId: string;
  clock: Clock;
  store: AiReviewStore;
  toast: ToastController;
  /** 홈 "자세히 보기"(location.state.openAiReview)로 들어왔다. 첫 GET이 반영되면 COMPLETED는 결과 시트, FAILED는 실패 시트를 한 번만 연다(REQ-AIR-047). */
  openAiReview: boolean;
}

/** FeedViewModel이 확정한 게시물 정보. isMine은 확정 전에는 진입 경로 값(시드)이다. */
export interface FeedAiPost {
  isMine: boolean;
  topicDate: DateString | null;
}

/**
 * 상세 화면의 AI 영역(알약·시트). FeedViewModel과 따로 만들어 화면(FeedBody)이 setPost로 이어 준다(기존 FeedState를 건드리지 않는다).
 *
 * - setPost: 내 게시물이 되면(그리고 게스트가 아니면) store.watch(postId, { refreshCompleted: true, canRequest })를 만들고 보이는 상태면 show()한다. 내 게시물이 아니면 watch도 GET도 없다(REQ-AIR-001).
 * - onShown/onHidden: 문서 가시성. 가려지면 watch.hide(), 다시 보이면 watch.show()(GET부터 새 창).
 * - onPillPress: request→시작 시트, retry→재요청 시트, view→결과 시트, failed→실패 시트, recheck→watch.recheck(). processing·checking·requesting은 눌러도 아무 일 없다.
 * - confirmStart: 시트를 닫고 request(). 누른 시점에도 자격(오늘 주제)을 다시 확인해 자정이 지났으면 POST를 보내지 않는다. closeSheet: 요청 없음.
 * - onRecheckPress: 폴링 창 종료 뒤 또는 check-failed의 "AI 상태 다시 확인".
 * - 자정(KST)에 자격이 바뀌면 상태를 다시 계산한다(MidnightWatcher). dispose: watch.release(), 타이머 정리.
 */
export class FeedAiViewModel extends ViewModel<FeedAiState> {
  private post: FeedAiPost | null = null;
  private watch: AiReviewWatch | null = null;
  private shown = false;
  private gone = false;
  /** openAiReview 진입의 자동 열기를 이미 했거나 해당 없음으로 끝냈다. */
  private autoOpenDone: boolean;
  private readonly midnight: MidnightWatcher;
  private readonly unsubscribe: () => void;

  constructor(protected readonly deps: FeedAiViewModelDeps) {
    super({ pill: 'hidden', stalled: false, recheckVisible: false, sheet: { kind: 'none' }, criteriaOpen: false });
    this.autoOpenDone = !deps.openAiReview;
    this.midnight = new MidnightWatcher({ clock: deps.clock, onDateChanged: () => this.sync() });
    this.unsubscribe = deps.store.subscribe(() => this.sync());
  }

  setPost(post: FeedAiPost): void {
    if (this.gone) return;
    this.post = post;
    if (!post.isMine) {
      this.releaseWatch();
    } else if (!this.watch) {
      this.watch = this.deps.store.watch(this.deps.postId, { refreshCompleted: true, canRequest: () => this.eligible() });
      if (this.shown) void this.showWatch();
    }
    this.sync();
  }

  async onShown(): Promise<void> {
    if (this.gone) return;
    this.shown = true;
    this.midnight.start();
    this.sync();
    await this.showWatch();
  }

  onHidden(): void {
    this.shown = false;
    this.midnight.stop();
    this.watch?.hide();
    this.sync();
  }

  onPillPress(): void {
    switch (this.state.pill) {
      case 'request':
        this.setState({ sheet: { kind: 'start', retry: false }, criteriaOpen: false });
        return;
      case 'retry':
        this.setState({ sheet: { kind: 'start', retry: true }, criteriaOpen: false });
        return;
      case 'view': {
        const result = this.entry()?.result;
        if (result) this.setState({ sheet: { kind: 'result', result }, criteriaOpen: false });
        return;
      }
      case 'failed':
        this.setState({ sheet: this.failedSheet(), criteriaOpen: false });
        return;
      case 'recheck':
        void this.onRecheckPress();
        return;
      default:
        return;
    }
  }

  async confirmStart(): Promise<void> {
    if (this.state.sheet.kind !== 'start') return;
    this.setState({ sheet: { kind: 'none' }, criteriaOpen: false });
    if (!this.eligible()) return;
    await this.watch?.request();
  }

  /** 실패 시트의 재요청 버튼(재요청 가능 + 오늘일 때만 있다): 실패 시트를 닫고 재요청 시트를 연다. */
  retryFromFailedSheet(): void {
    const { sheet } = this.state;
    if (sheet.kind !== 'failed' || !sheet.canRetry) return;
    this.setState({ sheet: { kind: 'start', retry: true } });
  }

  closeSheet(): void {
    this.setState({ sheet: { kind: 'none' }, criteriaOpen: false });
  }

  openCriteria(): void {
    if (this.state.sheet.kind === 'result') this.setState({ criteriaOpen: true });
  }

  closeCriteria(): void {
    this.setState({ criteriaOpen: false });
  }

  async onRecheckPress(): Promise<void> {
    if (!this.watch) return;
    await this.watch.recheck();
    this.tryAutoOpen();
  }

  override dispose(): void {
    this.gone = true;
    this.unsubscribe();
    this.midnight.stop();
    this.releaseWatch();
    super.dispose();
  }

  // ---------------------------------------------------------------- 내부

  private entry() {
    return this.deps.store.entry(this.deps.postId);
  }

  private eligible(): boolean {
    return canRequestAi({ isMine: this.post?.isMine ?? false, topicDate: this.post?.topicDate ?? null, today: kstToday(this.deps.clock) });
  }

  private releaseWatch(): void {
    this.watch?.release();
    this.watch = null;
  }

  private async showWatch(): Promise<void> {
    const watch = this.watch;
    if (!watch) return;
    await watch.show();
    if (this.watch === watch) this.tryAutoOpen();
  }

  private failedSheet(): FeedAiState['sheet'] {
    const entry = this.entry();
    const today = kstToday(this.deps.clock);
    const topicDate = this.post?.topicDate ?? null;
    return {
      kind: 'failed',
      reason: failedSheetReason({ entry, topicDate, today }),
      canRetry: !!entry?.canRequestAgain && this.eligible(),
    };
  }

  /** 홈 "자세히 보기"로 들어왔으면 첫 GET이 반영된 뒤 COMPLETED는 결과 시트, FAILED는 실패 시트를 한 번만 연다. */
  private tryAutoOpen(): void {
    if (this.autoOpenDone || this.gone || !this.shown) return;
    const entry = this.entry();
    if (!entry || entry.phase === 'checking' || entry.phase === 'check-failed') return;
    this.autoOpenDone = true;
    if (entry.phase !== 'ready') return;
    if (entry.status === 'COMPLETED' && entry.result) this.setState({ sheet: { kind: 'result', result: entry.result }, criteriaOpen: false });
    else if (entry.status === 'FAILED') this.setState({ sheet: this.failedSheet(), criteriaOpen: false });
  }

  private sync(): void {
    if (this.gone) return;
    const entry = this.entry();
    const pill = deriveAiPill({ entry, isMine: this.post?.isMine ?? false, topicDate: this.post?.topicDate ?? null, today: kstToday(this.deps.clock) });
    const stalled = pill === 'processing' && !!entry?.stalled;
    this.setState({ pill, stalled, recheckVisible: pill === 'recheck' || stalled });
  }
}
