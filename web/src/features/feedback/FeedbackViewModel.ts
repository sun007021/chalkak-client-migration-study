import { t } from '../../copy/ko';
import { ApiError, NetworkError, isAbandoned } from '../../core/net/errors';
import { ViewModel } from '../../core/state/ViewModel';
import type { ToastController } from '../../core/ui/ToastController';
import type { FeedbackRepository } from './FeedbackRepository';
import { feedbackLength, trimFeedback, validateFeedback } from './feedbackText';

export type FeedbackErrorKind = 'invalid' | 'network' | 'generic';

export interface FeedbackState {
  /** 입력 원문(앞뒤 공백 포함). */
  text: string;
  /** trim 후 code point 수(카운터 "count/1000"). */
  count: number;
  /** count >= 1이고 전송 중이 아닐 때. 1000 초과여도 true(보내기 시점에 검증, REQ-FDBK-005). */
  canSubmit: boolean;
  submitting: boolean;
  /** invalid → fdbk.error.invalid, network → common.error.network, generic → fdbk.error.generic. null이면 없음. 입력이 바뀌면 지운다. */
  error: FeedbackErrorKind | null;
}

export type FeedbackOutcome =
  /** 201. 토스트 fdbk.success를 이미 보였고 입력을 비웠다. 화면은 설정으로 돌아간다. */
  | { kind: 'sent' }
  /** 실패(입력 유지, error 설정) 또는 검증 거절(요청 0건). */
  | { kind: 'failed' }
  /** 비어 있음·전송 중 중복 호출이라 아무것도 하지 않았다. */
  | { kind: 'ignored' }
  /** 취소·dispose·계정 전환·401로 결과를 버렸다(토스트·오류 문구 없음). */
  | { kind: 'abandoned' };

/**
 * 피드백 화면 상태(REQ-FDBK-002~013). 화면이 마운트될 때마다 새로 만든다.
 * submit: trim 후 0자 -> ignored, 1000 초과 -> 요청 0건 + error 'invalid' (failed). 전송 중 중복 호출 -> ignored(요청 1회). 201 -> 토스트 + 입력 비움 + sent.
 * 400 -> invalid, NetworkError -> network, 그 밖(5xx·해석 불가) -> generic. 자동 재시도 없음. 401·취소·세션 변경 -> abandoned(문구 없음). dispose: 진행 중 요청 취소, 이후 토스트·상태 변경 없음.
 */
export class FeedbackViewModel extends ViewModel<FeedbackState> {
  private controller: AbortController | null = null;
  private closed = false;

  constructor(private readonly deps: { repository: FeedbackRepository; toast: ToastController }) {
    super({ text: '', count: 0, canSubmit: false, submitting: false, error: null });
  }

  setText(text: string): void {
    if (this.state.submitting || this.closed) return;
    const count = feedbackLength(text);
    this.setState({ text, count, canSubmit: count >= 1, error: null });
  }

  async submit(): Promise<FeedbackOutcome> {
    if (this.closed || this.state.submitting) return { kind: 'ignored' };
    const validity = validateFeedback(this.state.text);
    if (validity === 'empty') return { kind: 'ignored' };
    if (validity === 'too-long') {
      this.setState({ error: 'invalid' });
      return { kind: 'failed' };
    }
    const controller = new AbortController();
    this.controller = controller;
    this.setState({ submitting: true, canSubmit: false, error: null });
    try {
      await this.deps.repository.submit(trimFeedback(this.state.text), controller.signal);
    } catch (error) {
      if (this.closed || isAbandoned(error) || (error instanceof ApiError && error.status === 401)) {
        if (!this.closed) this.setState({ submitting: false, canSubmit: this.state.count >= 1 });
        return { kind: 'abandoned' };
      }
      this.setState({ submitting: false, canSubmit: this.state.count >= 1, error: errorKind(error) });
      return { kind: 'failed' };
    } finally {
      if (this.controller === controller) this.controller = null;
    }
    if (this.closed) return { kind: 'abandoned' };
    this.deps.toast.show(t('fdbk.success'));
    this.setState({ text: '', count: 0, canSubmit: false, submitting: false, error: null });
    return { kind: 'sent' };
  }

  override dispose(): void {
    this.closed = true;
    this.controller?.abort();
    super.dispose();
  }
}

function errorKind(error: unknown): FeedbackErrorKind {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof ApiError && error.status === 400) return 'invalid';
  return 'generic';
}
