import type { Point, Size, Stroke } from './Stroke';

/**
 * 사인 획 모델(순수 TS, 불변). 모든 변경은 새 인스턴스를 돌려준다.
 * - 좌표는 캔버스 영역 안으로 보정한다(TC-SIGN-005).
 * - 점이 없는 획은 사인으로 치지 않는다(TC-SIGN-003).
 */
export class SignatureStrokes {
  static empty(canvas: Size): SignatureStrokes {
    return new SignatureStrokes(canvas, [], false);
  }

  private constructor(
    readonly canvas: Size,
    readonly strokes: readonly Stroke[],
    /** 마지막 획이 아직 그려지는 중(endStroke 전)인지. */
    readonly drawing: boolean,
  ) {}

  /** 새 획을 시작한다. 그리는 중이던 획이 있으면 먼저 끝낸다. */
  beginStroke(_point: Point): SignatureStrokes {
    throw new Error('not implemented');
  }

  /** 그리는 중인 획에 점을 더한다. 그리는 중이 아니면 새 획을 시작한다. */
  appendPoint(_point: Point): SignatureStrokes {
    throw new Error('not implemented');
  }

  endStroke(): SignatureStrokes {
    throw new Error('not implemented');
  }

  /** 마지막 획 하나를 지운다. */
  undo(): SignatureStrokes {
    throw new Error('not implemented');
  }

  clear(): SignatureStrokes {
    throw new Error('not implemented');
  }

  /** 점이 하나라도 있는 획이 있으면 true. */
  get hasSignature(): boolean {
    throw new Error('not implemented');
  }

  /** 점이 있는 획만. */
  get validStrokes(): readonly Stroke[] {
    throw new Error('not implemented');
  }
}
