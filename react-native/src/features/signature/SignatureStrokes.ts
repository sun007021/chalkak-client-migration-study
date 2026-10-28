import type { Point, Size, Stroke } from './Stroke';

/**
 * 사인 획 모델(순수 TS, 불변). 모든 변경은 새 인스턴스를 돌려준다.
 * - 좌표는 캔버스 영역 안으로 보정한다(TC-SIGN-005).
 * - 점이 없는 획은 사인으로 치지 않는다(TC-SIGN-003).
 */
/** 총 점 수 상한. 넘는 입력은 버린다(래스터라이즈 비용과 메모리 보호). */
export const MAX_SIGNATURE_POINTS = 5000;
/** 이웃한 점 사이 최소 거리(논리 캔버스 좌표). 이보다 가까운 점은 모양에 영향이 없어 샘플링에서 뺀다. */
export const MIN_POINT_DISTANCE = 1;

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
  beginStroke(point: Point): SignatureStrokes {
    if (!isFinitePoint(point)) return this.endStroke();
    if (this.pointCount >= MAX_SIGNATURE_POINTS) return this.endStroke();
    return new SignatureStrokes(this.canvas, [...this.strokes, [this.clamp(point)]], true);
  }

  /** 그리는 중인 획에 점을 더한다. 그리는 중이 아니면 새 획을 시작한다. */
  appendPoint(point: Point): SignatureStrokes {
    if (!isFinitePoint(point)) return this;
    if (!this.drawing || this.strokes.length === 0) return this.beginStroke(point);
    if (this.pointCount >= MAX_SIGNATURE_POINTS) return this;
    const last = this.strokes[this.strokes.length - 1];
    const next = this.clamp(point);
    const tail = last[last.length - 1];
    if (Math.hypot(next.x - tail.x, next.y - tail.y) < MIN_POINT_DISTANCE) return this;
    const strokes = [...this.strokes.slice(0, -1), [...last, next]];
    return new SignatureStrokes(this.canvas, strokes, true);
  }

  endStroke(): SignatureStrokes {
    return this.drawing ? new SignatureStrokes(this.canvas, this.strokes, false) : this;
  }

  /** 마지막 획 하나를 지운다. */
  undo(): SignatureStrokes {
    return new SignatureStrokes(this.canvas, this.strokes.slice(0, -1), false);
  }

  clear(): SignatureStrokes {
    return SignatureStrokes.empty(this.canvas);
  }

  /** 점이 하나라도 있는 획이 있으면 true. */
  get hasSignature(): boolean {
    return this.validStrokes.length > 0;
  }

  /** 점이 있는 획만. */
  get validStrokes(): readonly Stroke[] {
    return this.strokes.filter((stroke) => stroke.length > 0);
  }

  private get pointCount(): number {
    let count = 0;
    for (const stroke of this.strokes) count += stroke.length;
    return count;
  }

  private clamp(point: Point): Point {
    return {
      x: Math.min(Math.max(point.x, 0), this.canvas.width),
      y: Math.min(Math.max(point.y, 0), this.canvas.height),
    };
  }
}

const isFinitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);
