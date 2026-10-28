import { ViewModel } from '../../core/state/ViewModel';

export interface PadPoint {
  x: number;
  y: number;
}
export type PadStroke = readonly PadPoint[];
export interface PadSize {
  width: number;
  height: number;
}

/** 그리기 영역의 크기와 획. rasterizer와 geometry의 입력이다. */
export interface SignatureDrawing extends PadSize {
  strokes: readonly PadStroke[];
}

export interface SignaturePadState {
  strokes: readonly PadStroke[];
  /** 점이 하나라도 있는 획이 있다(REQ-SIGN-003). 제출·전체 지우기 활성 조건. */
  hasSignature: boolean;
  /** 되돌릴 획이 있다. */
  canUndo: boolean;
  /** 획을 그리는 중(beginStroke ~ endStroke). */
  drawing: boolean;
}

/**
 * 포인터 이벤트로 획을 모으는 순수 모델(React·DOM 없음). 좌표는 size 안(0..width, 0..height)으로 보정한다(TC-SIGN-005).
 * 유한하지 않은 좌표(NaN, Infinity)는 무시한다. 점이 없는 획은 만들지 않는다.
 */
export class SignaturePad extends ViewModel<SignaturePadState> {
  constructor(readonly size: PadSize) {
    super({ strokes: [], hasSignature: false, canUndo: false, drawing: false });
  }

  /** 새 획을 시작하고 첫 점을 넣는다. 점 하나만 찍고 끝내도 획으로 인정한다(REQ-SIGN-005). 그리는 중이면 이전 획을 끝낸다. */
  beginStroke(_point: PadPoint): void {
    throw new Error('not implemented');
  }

  /** 그리는 중인 획에 점을 더한다. 그리는 중이 아니면 무시. */
  extendStroke(_point: PadPoint): void {
    throw new Error('not implemented');
  }

  endStroke(): void {
    throw new Error('not implemented');
  }

  /** 완성된 획을 한 번에 넣는다(점이 없으면 무시). 테스트·복원용. */
  addStroke(_points: readonly PadPoint[]): void {
    throw new Error('not implemented');
  }

  /** 마지막 획 하나를 지운다. 그리는 중이면 그 획을 끝내고 지운다. */
  undo(): void {
    throw new Error('not implemented');
  }

  clear(): void {
    throw new Error('not implemented');
  }

  /** 지금 상태의 복사본. 이후 변경이 반영되지 않는다. */
  snapshot(): SignatureDrawing {
    throw new Error('not implemented');
  }
}
