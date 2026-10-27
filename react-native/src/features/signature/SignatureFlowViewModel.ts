import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { Observable } from '../../core/state/Observable';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { SignatureMode } from './mapSignatureError';
import type { SignatureDrawViewModel } from './SignatureDrawViewModel';
import type { SignatureEncoder } from './SignatureEncoder';
import type { SignaturePreviewViewModel } from './SignaturePreviewViewModel';
import type { SignatureSubmitter } from './SignatureSubmitter';
import type { Size } from './Stroke';

export type SignatureFlowState = { step: 'draw' | 'preview' };

export type SignatureFlowDeps = {
  mode: SignatureMode;
  canvas: Size;
  encoder: SignatureEncoder;
  submitter: SignatureSubmitter;
  analytics: AnalyticsTracker;
  toast: ToastPresenter;
  authNavigator: AuthFlowNavigator;
  /** 가입 완료 / 변경 성공(토스트는 이 클래스가 먼저 보인다). 이후 이동은 호출한 쪽. */
  onCompleted: () => void;
  /** 그리기 화면에서 뒤로: 가입은 약관으로, 변경은 설정으로. */
  onExit: () => void;
};

/**
 * 그리기 -> 미리보기 두 단계(가입·변경 공용). draw/preview ViewModel의 소유자:
 * 화면이 아니라 이 클래스가 만들고 버린다. screen_view도 여기서 단계 진입마다 한 번 보낸다.
 * 가입: onboarding_signature, onboarding_signature_preview / 변경: change_signature, change_signature_preview.
 */
export class SignatureFlowViewModel extends Observable<SignatureFlowState> {
  constructor(private readonly deps: SignatureFlowDeps) {
    super({ step: 'draw' });
  }

  get mode(): SignatureMode {
    return this.deps.mode;
  }

  /** 항상 존재한다(미리보기에서 돌아와도 같은 인스턴스, 획 유지). */
  get draw(): SignatureDrawViewModel {
    throw new Error('not implemented');
  }

  /** step이 'preview'인 동안에만 값이 있다. */
  get preview(): SignaturePreviewViewModel | null {
    throw new Error('not implemented');
  }

  /** 소유자가 만든 직후 한 번 부른다: 첫 단계의 screen_view를 보낸다. */
  start(): void {
    throw new Error('not implemented');
  }

  /** 하드웨어/화면 뒤로: 미리보기면 그리기로(진행 중 요청은 취소), 그리기면 onExit. */
  back(): void {
    throw new Error('not implemented');
  }
}
