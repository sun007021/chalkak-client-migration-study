import type { Stroke } from './Stroke';

/**
 * 화면에 그릴 SVG path. 래스터라이저와 같은 이차 곡선 이음(첫 점 M, 각 중간점을 제어점으로 다음 점과의 중점까지 Q, 마지막 점 L)이다.
 * 점이 하나인 획은 null(호출 쪽이 원으로 그린다).
 */
export function strokeToSvgPath(stroke: Stroke): string | null {
  if (stroke.length < 2) return null;
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = `M${f(stroke[0].x)} ${f(stroke[0].y)}`;
  for (let i = 1; i < stroke.length - 1; i += 1) {
    const c = stroke[i];
    const n = stroke[i + 1];
    d += ` Q${f(c.x)} ${f(c.y)} ${f((c.x + n.x) / 2)} ${f((c.y + n.y) / 2)}`;
  }
  const last = stroke[stroke.length - 1];
  return `${d} L${f(last.x)} ${f(last.y)}`;
}
