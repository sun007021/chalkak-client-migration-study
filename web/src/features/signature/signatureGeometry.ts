import type { PadPoint, PadSize, PadStroke, SignatureDrawing } from './SignaturePad';

/** 화면 요소의 CSS 상자(getBoundingClientRect 일부). */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 점이 하나라도 있는 획이 있으면 true(TC-SIGN-003, 004). */
export function hasSignature(_strokes: readonly PadStroke[]): boolean {
  throw new Error('not implemented');
}

/** 클라이언트 좌표 → 패드 좌표: ((client - rect.origin) / rect.size) * pad.size. 보정(clamp)은 SignaturePad가 한다. rect가 0 크기면 (0,0). */
export function clientToPad(_client: { x: number; y: number }, _rect: ClientRect, _size: PadSize): PadPoint {
  throw new Error('not implemented');
}

/**
 * 그린 점을 PNG 좌표로 옮기는 순수 계산(REQ-SIGN-007, Flutter SignatureGeometry와 같은 식).
 * 모든 점의 외곽 박스를 PNG 크기 비율로 늘려 구하고, 한 변이 최소 0.02(캔버스 대비)보다 작으면 0.02로 취급한 뒤,
 * 비율을 유지한 채 (width-2*padding) x (height-2*padding) 영역에 중앙 정렬한다. 점 하나·직선·같은 점 반복도 유한한 값.
 * 빈 획(점 없음)은 결과에서 빠지고 나머지 획의 점 개수·순서는 유지한다. 사인이 없으면 빈 배열.
 */
export function layoutStrokes(_drawing: SignatureDrawing, _output: { width: number; height: number; padding: number }): PadPoint[][] {
  throw new Error('not implemented');
}

export type PathOp =
  | { op: 'move'; x: number; y: number }
  | { op: 'line'; x: number; y: number }
  | { op: 'quad'; cx: number; cy: number; x: number; y: number };

export type DrawCommand =
  /** 점 하나뿐인 획: 반지름 = 획 두께/2 인 채운 원(TC-SIGN-002). */
  | { kind: 'dot'; x: number; y: number; radius: number }
  /** 점이 둘 이상인 획: 이차 곡선으로 부드럽게 이은 경로. 둥근 끝·이음은 그리는 쪽이 정한다. */
  | { kind: 'stroke'; ops: PathOp[] };

/**
 * 한 획의 경로. 점 2개는 move + line. 3개 이상은 move(p0), 이어서 각 중간 점 p[i]를 제어점으로 p[i]와 p[i+1]의 중점까지 quad, 마지막에 line(p[last]).
 */
export function smoothPath(_points: readonly PadPoint[]): PathOp[] {
  throw new Error('not implemented');
}

/** layoutStrokes → 획별 DrawCommand. 순서는 획 순서. 사인이 없으면 빈 배열. */
export function buildSignatureCommands(_drawing: SignatureDrawing, _spec: { width: number; height: number; padding: number; strokeWidth: number }): DrawCommand[] {
  throw new Error('not implemented');
}
