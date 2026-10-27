import { Observable } from '../../core/state/Observable';
import { t } from '../../shared/copy';
import { SignatureTooLargeError, type SignatureEncoder } from './SignatureEncoder';
import { SignatureStrokes } from './SignatureStrokes';
import type { Point, Size, Stroke } from './Stroke';

export type SignatureDrawState = {
  strokes: readonly Stroke[];
  hasSignature: boolean;
  canUndo: boolean;
  canClear: boolean;
  /** "이 사인으로 할래요" 활성 여부(획이 있고 인코딩 중이 아닐 때). */
  canSubmit: boolean;
  encoding: boolean;
  /** signature.error-message에 보일 문구(1MB 초과, 서버가 거절한 사인 등). */
  error: string | null;
};

export type SignatureDrawDeps = {
  canvas: Size;
  encoder: SignatureEncoder;
  /** 인코딩에 성공하면 정확히 한 번 불린다(연타 방지). */
  onConfirmed: (png: Uint8Array) => void;
};

export class SignatureDrawViewModel extends Observable<SignatureDrawState> {
  private model: SignatureStrokes;

  constructor(private readonly deps: SignatureDrawDeps) {
    super(project(SignatureStrokes.empty(deps.canvas), false, null));
    this.model = SignatureStrokes.empty(deps.canvas);
  }

  /** 논리 캔버스 크기. 화면이 터치 좌표를 이 크기로 환산할 때 쓴다. */
  get canvas(): Size {
    return this.deps.canvas;
  }

  beginStroke(point: Point): void {
    this.apply(this.model.beginStroke(point), true);
  }

  appendPoint(point: Point): void {
    this.apply(this.model.appendPoint(point), true);
  }

  endStroke(): void {
    this.apply(this.model.endStroke(), true);
  }

  undo(): void {
    this.apply(this.model.undo(), true);
  }

  clear(): void {
    this.apply(this.model.clear(), true);
  }

  /** 인코딩 -> onConfirmed. 1 MiB 초과면 error를 두고 획은 유지한다. 인코딩 중 재호출은 무시. */
  async confirm(): Promise<void> {
    const { encoding, hasSignature } = this.getSnapshot();
    if (encoding || !hasSignature) return;
    this.setState({ ...this.getSnapshot(), encoding: true, canSubmit: false, error: null });
    let png: Uint8Array;
    try {
      png = await this.deps.encoder.encode(this.model.validStrokes, this.deps.canvas);
    } catch (error) {
      const message =
        error instanceof SignatureTooLargeError
          ? t('sign.error.too-large')
          : t('sign.change.error.generic');
      this.setState(project(this.model, false, message));
      return;
    }
    this.setState(project(this.model, false, null));
    this.deps.onConfirmed(png);
  }

  /** 미리보기에서 서버가 사인을 거절해 돌아왔을 때처럼 밖에서 오류 문구를 올린다(획 유지). */
  showError(message: string): void {
    this.setState({ ...this.getSnapshot(), error: message });
  }

  dismissError(): void {
    this.setState({ ...this.getSnapshot(), error: null });
  }

  /** 획이 바뀌는 입력은 이전 오류를 지운다. 인코딩 중에는 입력을 받지 않는다. */
  private apply(next: SignatureStrokes, clearError: boolean): void {
    if (this.getSnapshot().encoding) return;
    this.model = next;
    this.setState(project(next, false, clearError ? null : this.getSnapshot().error));
  }
}

function project(
  model: SignatureStrokes,
  encoding: boolean,
  error: string | null,
): SignatureDrawState {
  const has = model.hasSignature;
  return {
    strokes: model.strokes,
    hasSignature: has,
    canUndo: has,
    canClear: has,
    canSubmit: has && !encoding,
    encoding,
    error,
  };
}
