import { SIGNATURE_MAX_BYTES } from '../../constants';
import { t } from '../../copy/ko';
import { ViewModel } from '../../core/state/ViewModel';
import type { Logger } from '../../core/net/Logger';
import type { SignatureDraft } from './SignatureDraft';
import type { SignatureMode } from './SignatureMode';
import type { SignaturePad } from './SignaturePad';
import type { SignatureRasterizer } from './SignatureRasterizer';

export interface SignatureDrawError {
  /** 메시지마다 고유. 같은 문구가 연달아 나와도 다르다. */
  id: string;
  message: string;
}

export interface SignatureDrawState {
  /** PNG를 만드는 중. 제출 버튼 비활성, 연타해도 한 번만. */
  busy: boolean;
  /** 로컬 검증 오류(signature.error-message). 그리기 내용은 유지. 다시 그리거나 되돌리거나 지우면 사라진다. */
  error: SignatureDrawError | null;
}

export type SignatureDrawOutcome =
  /** PNG를 SignatureDraft에 넣었다. 미리보기로. */
  | { kind: 'preview' }
  | { kind: 'stay' };

export interface SignatureDrawViewModelDeps {
  mode: SignatureMode;
  pad: SignaturePad;
  rasterizer: SignatureRasterizer;
  draft: SignatureDraft;
  nextId(): string;
  logger?: Logger;
}

/**
 * 그리기 화면 상태(REQ-SIGN-001~009). 제출 가능 여부는 pad.state.hasSignature.
 * submit: 사인이 없거나 busy면 stay(rasterizer 0회). 있으면 pad.snapshot()을 rasterizer로 PNG로 만들고,
 * size가 SIGNATURE_MAX_BYTES(1,048,576) 이하면 draft에 넣고 preview, 초과면 서버 호출 없이 sign.error.too-large를 error로(그리기 유지, draft 비어 있음).
 * rasterizer가 던지면 모드별 generic 문구(onb.signup.error.generic / sign.change.error.generic). dispose 뒤에 끝난 결과는 버린다.
 */
export class SignatureDrawViewModel extends ViewModel<SignatureDrawState> {
  private closed = false;
  private readonly unsubscribePad: () => void;

  constructor(private readonly _deps: SignatureDrawViewModelDeps) {
    super({ busy: false, error: null });
    // 다시 그리거나 되돌리거나 지우면(패드가 바뀌면) 오류를 거둔다.
    this.unsubscribePad = _deps.pad.subscribe(() => this.dismissError());
  }

  get pad(): SignaturePad {
    return this._deps.pad;
  }

  async submit(): Promise<SignatureDrawOutcome> {
    const { pad, rasterizer, draft } = this._deps;
    if (!pad.state.hasSignature || this.state.busy) return { kind: 'stay' };
    this.setState({ busy: true, error: null });
    let png: Blob;
    try {
      png = await rasterizer.rasterize(pad.snapshot());
    } catch (error) {
      this._deps.logger?.log('warn', 'signature rasterize failed', { error });
      if (this.closed) return { kind: 'stay' };
      this.fail(t(this._deps.mode === 'onboarding' ? 'onb.signup.error.generic' : 'sign.change.error.generic'));
      return { kind: 'stay' };
    }
    if (this.closed) return { kind: 'stay' };
    if (png.size > SIGNATURE_MAX_BYTES) {
      this.fail(t('sign.error.too-large'));
      return { kind: 'stay' };
    }
    draft.set(png);
    this.setState({ busy: false });
    return { kind: 'preview' };
  }

  dismissError(): void {
    this.setState({ error: null });
  }

  override dispose(): void {
    this.closed = true;
    this.unsubscribePad();
    super.dispose();
  }

  private fail(message: string): void {
    this.setState({ busy: false, error: { id: this._deps.nextId(), message } });
  }
}
