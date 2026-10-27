import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { t } from '../../shared/copy';
import { Observable } from '../../core/state/Observable';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { SignatureMode } from './mapSignatureError';
import { SignatureDrawViewModel } from './SignatureDrawViewModel';
import type { SignatureEncoder } from './SignatureEncoder';
import { SignaturePreviewViewModel } from './SignaturePreviewViewModel';
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
  private readonly drawViewModel: SignatureDrawViewModel;
  private previewViewModel: SignaturePreviewViewModel | null = null;
  private released = false;

  constructor(private readonly deps: SignatureFlowDeps) {
    super({ step: 'draw' });
    this.drawViewModel = new SignatureDrawViewModel({
      canvas: deps.canvas,
      encoder: deps.encoder,
      onConfirmed: (png) => this.openPreview(png),
    });
  }

  get mode(): SignatureMode {
    return this.deps.mode;
  }

  /** 항상 존재한다(미리보기에서 돌아와도 같은 인스턴스, 획 유지). */
  get draw(): SignatureDrawViewModel {
    return this.drawViewModel;
  }

  /** step이 'preview'인 동안에만 값이 있다. */
  get preview(): SignaturePreviewViewModel | null {
    return this.previewViewModel;
  }

  /** 소유자가 만든 직후 한 번 부른다: 첫 단계의 screen_view를 보낸다. */
  start(): void {
    this.deps.analytics.screenView(this.screenName('draw'));
  }

  /** 하드웨어/화면 뒤로: 미리보기면 그리기로(진행 중 요청은 취소), 그리기면 onExit. */
  back(): void {
    if (this.released) return;
    // 서버가 받아 준 뒤 세션을 저장하는 동안은 되돌아가지 않는다(저장과 화면이 어긋나는 것 방지).
    if (this.previewViewModel?.committing) return;
    if (this.getSnapshot().step === 'preview') this.backToDraw();
    else this.deps.onExit();
  }

  override dispose(): void {
    this.released = true;
    this.previewViewModel?.dispose();
    this.previewViewModel = null;
    this.drawViewModel.dispose();
    super.dispose();
  }

  private openPreview(png: Uint8Array): void {
    if (this.released || this.getSnapshot().step !== 'draw') return;
    const { mode, submitter, authNavigator, toast, analytics } = this.deps;
    this.previewViewModel = new SignaturePreviewViewModel({
      mode,
      png,
      submitter,
      authNavigator,
      toast,
      host: {
        onRedraw: () => {
          this.drawViewModel.clear();
          this.backToDraw();
        },
        onRejected: (message) => {
          this.backToDraw();
          this.drawViewModel.showError(message);
        },
        onCompleted: () => this.complete(),
      },
    });
    this.setState({ step: 'preview' });
    analytics.screenView(this.screenName('preview'));
  }

  private backToDraw(): void {
    this.previewViewModel?.dispose();
    this.previewViewModel = null;
    this.setState({ step: 'draw' });
    this.deps.analytics.screenView(this.screenName('draw'));
  }

  private complete(): void {
    if (this.deps.mode === 'change') this.deps.toast.show(t('sign.change.done'));
    this.deps.onCompleted();
  }

  private screenName(step: 'draw' | 'preview'): string {
    const base = this.deps.mode === 'onboarding' ? 'onboarding_signature' : 'change_signature';
    return step === 'draw' ? base : `${base}_preview`;
  }
}
