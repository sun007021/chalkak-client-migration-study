import { Observable } from '../../core/state/Observable';
import type { SignatureEncoder } from './SignatureEncoder';
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
  constructor(private readonly deps: SignatureDrawDeps) {
    super({
      strokes: [],
      hasSignature: false,
      canUndo: false,
      canClear: false,
      canSubmit: false,
      encoding: false,
      error: null,
    });
  }

  beginStroke(_point: Point): void {
    throw new Error('not implemented');
  }

  appendPoint(_point: Point): void {
    throw new Error('not implemented');
  }

  endStroke(): void {
    throw new Error('not implemented');
  }

  undo(): void {
    throw new Error('not implemented');
  }

  clear(): void {
    throw new Error('not implemented');
  }

  /** 인코딩 -> onConfirmed. 1 MiB 초과면 error를 두고 획은 유지한다. 인코딩 중 재호출은 무시. */
  async confirm(): Promise<void> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** 미리보기에서 서버가 사인을 거절해 돌아왔을 때처럼 밖에서 오류 문구를 올린다(획 유지). */
  showError(_message: string): void {
    throw new Error('not implemented');
  }

  dismissError(): void {
    throw new Error('not implemented');
  }
}
