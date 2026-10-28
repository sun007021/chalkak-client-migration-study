import { encodePng } from '../../core/image/png';
import type { RasterRequest, SignatureRasterizer } from './SignatureRasterizer';
import type { Point, Stroke } from './Stroke';

/**
 * 순수 TS 래스터라이저: RGBA 버퍼에 직접 그리고 PNG로 인코딩한다. 네이티브 의존성이 없어 다섯 플랫폼이
 * 같은 알고리즘(이차 곡선 이음 + 둥근 끝 선분의 합집합)을 쓸 수 있다.
 * 경로는 기존 앱과 같다: 점이 1개면 지름 strokeWidth의 원, 2개면 직선, 3개 이상이면 첫 점에서 시작해
 * 각 중간점을 제어점으로, 다음 점과의 중점을 끝점으로 하는 이차 곡선을 잇고 마지막 점까지 직선.
 * 안티앨리어싱은 픽셀 중심과 선분 사이 거리로 구한 덮임 비율(알파)이고 색은 항상 흰색이다.
 */
export class SoftwareSignatureRasterizer implements SignatureRasterizer {
  rasterize(request: RasterRequest): Promise<Uint8Array> {
    try {
      const { width, height, strokeWidth, strokes } = request;
      const alpha = new Uint8Array(width * height);
      const radius = strokeWidth / 2;
      for (const stroke of strokes) {
        for (const [a, b] of toSegments(stroke)) paintCapsule(alpha, width, height, a, b, radius);
      }
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < alpha.length; i += 1) {
        if (alpha[i] === 0) continue;
        rgba[i * 4] = 255;
        rgba[i * 4 + 1] = 255;
        rgba[i * 4 + 2] = 255;
        rgba[i * 4 + 3] = alpha[i];
      }
      return Promise.resolve(encodePng(rgba, width, height));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** 곡선을 펴는 선분 길이(대략). 둥근 두께 14px 선이라 이 정도 꺾임은 보이지 않는다. */
const CURVE_STEP_PX = 6;

type Segment = readonly [Point, Point];

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** 획 경로를 짧은 선분들로 펴 준다. 점 하나는 길이 0 선분(= 원). */
function toSegments(stroke: Stroke): Segment[] {
  if (stroke.length === 0) return [];
  if (stroke.length === 1) return [[stroke[0], stroke[0]]];
  const segments: Segment[] = [];
  let current = stroke[0];
  const lineTo = (to: Point) => {
    segments.push([current, to]);
    current = to;
  };
  for (let i = 1; i < stroke.length - 1; i += 1) {
    const control = stroke[i];
    const end = mid(stroke[i], stroke[i + 1]);
    const steps = Math.min(
      64,
      Math.max(1, Math.ceil((dist(current, control) + dist(control, end)) / CURVE_STEP_PX)),
    );
    const start = current;
    for (let s = 1; s <= steps; s += 1) {
      const u = s / steps;
      const k = 1 - u;
      lineTo({
        x: k * k * start.x + 2 * k * u * control.x + u * u * end.x,
        y: k * k * start.y + 2 * k * u * control.y + u * u * end.y,
      });
    }
  }
  lineTo(stroke[stroke.length - 1]);
  return segments;
}

/** 선분 a-b를 반지름 radius의 둥근 끝으로 칠한다. 픽셀 알파는 기존 값과 큰 쪽을 쓴다. */
function paintCapsule(
  alpha: Uint8Array,
  width: number,
  height: number,
  a: Point,
  b: Point,
  radius: number,
): void {
  const reach = radius + 1;
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + reach));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + reach));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const outer = (radius + 0.5) * (radius + 0.5);
  for (let y = y0; y <= y1; y += 1) {
    const py = y + 0.5 - a.y;
    for (let x = x0; x <= x1; x += 1) {
      const px = x + 0.5 - a.x;
      let t = lengthSquared === 0 ? 0 : (px * dx + py * dy) / lengthSquared;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - t * dx;
      const ey = py - t * dy;
      const distanceSquared = ex * ex + ey * ey;
      if (distanceSquared >= outer) continue;
      const coverage = Math.min(1, radius + 0.5 - Math.sqrt(distanceSquared));
      const value = Math.round(coverage * 255);
      const index = y * width + x;
      if (value > alpha[index]) alpha[index] = value;
    }
  }
}
