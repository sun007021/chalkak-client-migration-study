import type { Size, Stroke } from './Stroke';

export type PngSpec = {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly strokeWidth: number;
};

/** 외곽 박스 한 변의 최소 크기(캔버스 대비 비율). 한 점·직선이 0으로 나눠지지 않게 한다. */
const MIN_NORMALIZED_SIZE = 0.02;

/**
 * 캔버스 좌표 획 -> PNG 좌표 획. 기존 iOS `SignaturePngEncoder`·Android `SignaturePngEncoder`와 같은 식이다.
 * 1) 점을 캔버스 크기로 나눈 비율로 바꾸고 외곽 박스를 구한다. 한 변이 0.02보다 작으면 0.02로 취급한다.
 * 2) 배율 = min((W-2P)/박스폭, (H-2P)/박스높이)를 비율 좌표에 곱한다(캔버스가 정사각형이면 픽셀 비율 유지).
 * 3) 박스(0.02로 올린 크기)를 PNG 가운데에 두고, 점은 박스 왼쪽 위 모서리를 기준으로 놓는다.
 *    그래서 한 점이나 직선은 최소 박스의 왼쪽/위 변에 놓이며 정확히 중앙은 아니다(원본 동작 그대로).
 */
export function fitStrokesToPng(strokes: readonly Stroke[], canvas: Size, spec: PngSpec): Stroke[] {
  const width = Math.max(canvas.width, 1);
  const height = Math.max(canvas.height, 1);
  // 유한하지 않은 좌표(NaN, Infinity)는 버린다. 하나라도 섞이면 배율이 NaN이 되어 PNG 전체가 깨진다.
  const ratios = strokes
    .map((stroke) =>
      stroke
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => ({ x: p.x / width, y: p.y / height })),
    )
    .filter((stroke) => stroke.length > 0);
  // min/max는 한 번의 순회로 구한다(Math.min(...)은 점이 많으면 인자 한도를 넘는다).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const stroke of ratios) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (ratios.length === 0) return [];
  const contentWidth = Math.max(maxX - minX, MIN_NORMALIZED_SIZE);
  const contentHeight = Math.max(maxY - minY, MIN_NORMALIZED_SIZE);
  const scale = Math.min(
    (spec.width - spec.padding * 2) / contentWidth,
    (spec.height - spec.padding * 2) / contentHeight,
  );
  const offsetX = (spec.width - contentWidth * scale) / 2;
  const offsetY = (spec.height - contentHeight * scale) / 2;
  return ratios.map((stroke) =>
    stroke.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale })),
  );
}
