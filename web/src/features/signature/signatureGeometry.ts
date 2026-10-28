import type { PadPoint, PadSize, PadStroke, SignatureDrawing } from './SignaturePad';

/** 화면 요소의 CSS 상자(getBoundingClientRect 일부). */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 점이 하나라도 있는 획이 있으면 true(TC-SIGN-003, 004). */
export function hasSignature(strokes: readonly PadStroke[]): boolean {
  return strokes.some((stroke) => stroke.length > 0);
}

/** 클라이언트 좌표 → 패드 좌표: ((client - rect.origin) / rect.size) * pad.size. 보정(clamp)은 SignaturePad가 한다. rect가 0 크기면 (0,0). */
export function clientToPad(client: { x: number; y: number }, rect: ClientRect, size: PadSize): PadPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return { x: ((client.x - rect.left) / rect.width) * size.width, y: ((client.y - rect.top) / rect.height) * size.height };
}

/** 외곽 박스 한 변의 최소 비율(캔버스 대비). */
const MIN_BOX_RATIO = 0.02;

/**
 * 그린 점을 PNG 좌표로 옮기는 순수 계산(REQ-SIGN-007, Flutter SignatureGeometry와 같은 식).
 * 모든 점의 외곽 박스를 PNG 크기 비율로 늘려 구하고, 한 변이 최소 0.02(캔버스 대비)보다 작으면 0.02로 취급한 뒤,
 * 비율을 유지한 채 (width-2*padding) x (height-2*padding) 영역에 중앙 정렬한다. 점 하나·직선·같은 점 반복도 유한한 값.
 * 빈 획(점 없음)은 결과에서 빠지고 나머지 획의 점 개수·순서는 유지한다. 사인이 없으면 빈 배열.
 */
export function layoutStrokes(drawing: SignatureDrawing, output: { width: number; height: number; padding: number }): PadPoint[][] {
  const strokes = drawing.strokes.filter((stroke) => stroke.length > 0);
  if (strokes.length === 0 || drawing.width <= 0 || drawing.height <= 0) return [];
  // 그린 점을 PNG 크기 비율로 늘린 좌표로 옮긴다.
  const scaled = strokes.map((stroke) => stroke.map((p) => ({ x: (p.x / drawing.width) * output.width, y: (p.y / drawing.height) * output.height })));
  const all = scaled.flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const boxW = Math.max(maxX - minX, output.width * MIN_BOX_RATIO);
  const boxH = Math.max(maxY - minY, output.height * MIN_BOX_RATIO);
  const scale = Math.min((output.width - 2 * output.padding) / boxW, (output.height - 2 * output.padding) / boxH);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return scaled.map((stroke) => stroke.map((p) => ({ x: output.width / 2 + (p.x - centerX) * scale, y: output.height / 2 + (p.y - centerY) * scale })));
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
export function smoothPath(points: readonly PadPoint[]): PathOp[] {
  const first = points[0];
  if (!first) return [];
  const ops: PathOp[] = [{ op: 'move', x: first.x, y: first.y }];
  if (points.length === 1) return ops;
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i]!;
    const next = points[i + 1]!;
    ops.push({ op: 'quad', cx: control.x, cy: control.y, x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 });
  }
  const last = points[points.length - 1]!;
  ops.push({ op: 'line', x: last.x, y: last.y });
  return ops;
}

/** layoutStrokes → 획별 DrawCommand. 순서는 획 순서. 사인이 없으면 빈 배열. */
export function buildSignatureCommands(drawing: SignatureDrawing, spec: { width: number; height: number; padding: number; strokeWidth: number }): DrawCommand[] {
  return layoutStrokes(drawing, spec).map((stroke): DrawCommand => {
    const only = stroke.length === 1 ? stroke[0] : undefined;
    if (only) return { kind: 'dot', x: only.x, y: only.y, radius: spec.strokeWidth / 2 };
    return { kind: 'stroke', ops: smoothPath(stroke) };
  });
}
