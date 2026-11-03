import { ViewModel } from '../../core/state/ViewModel';
import type { ToastController } from '../../core/ui/ToastController';
import type { FeedbackRepository } from './FeedbackRepository';

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
 * W11 구현 대기(스텁). 피드백 화면 상태(REQ-FDBK-002~013). 화면이 마운트될 때마다 새로 만든다.
 * submit: trim 후 0자 → ignored, 1000 초과 → 요청 0건 + error 'invalid' (failed). 전송 중 중복 호출 → ignored(요청 1회). 201 → 토스트 + 입력 비움 + sent.
 * 400 → invalid, NetworkError → network, 그 밖(5xx·해석 불가) → generic. 자동 재시도 없음. 401·취소·세션 변경 → abandoned(문구 없음). dispose: 진행 중 요청 취소, 이후 토스트·상태 변경 없음.
 */
export class FeedbackViewModel extends ViewModel<FeedbackState> {
  constructor(private readonly deps: { repository: FeedbackRepository; toast: ToastController }) {
    super({ text: '', count: 0, canSubmit: false, submitting: false, error: null });
  }

  setText(text: string): void {
    void this.deps;
    void text;
    throw new Error('not implemented');
  }

  submit(): Promise<FeedbackOutcome> {
    throw new Error('not implemented');
  }
}
