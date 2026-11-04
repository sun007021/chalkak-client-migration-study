import { POST_IMAGE_MAX_LONG_EDGE, WEBP_DOWNSCALE_FACTOR, WEBP_DOWNSCALE_MAX_ATTEMPTS } from '../../constants';

export interface Size {
  width: number;
  height: number;
}

/**
 * 긴 변이 maxLongEdge(기본 POST_IMAGE_MAX_LONG_EDGE=4096)를 넘으면 가로세로 비율을 유지해 긴 변을 maxLongEdge로 줄인다(연속 비율, 반올림, 각 변 최소 1).
 * 이미 이하이면 그대로이며 어떤 경우에도 확대하지 않는다(REQ-UPL-027).
 */
export function fitLongEdge(size: Size, maxLongEdge: number = POST_IMAGE_MAX_LONG_EDGE): Size {
  const longEdge = Math.max(size.width, size.height);
  if (longEdge <= maxLongEdge) return { width: size.width, height: size.height };
  const ratio = maxLongEdge / longEdge;
  return { width: Math.max(1, Math.round(size.width * ratio)), height: Math.max(1, Math.round(size.height * ratio)) };
}

/**
 * 인코딩 라운드별 크기. 0번은 base 그대로이고 k번은 base × factor^k를 각 변마다 반올림한 값(누적 비율이며 앞 라운드의 반올림 값에 다시 곱하지 않는다, 각 변 최소 1).
 * 길이는 shrinks + 1(기본 WEBP_DOWNSCALE_MAX_ATTEMPTS=3 → 4라운드, 인수 factor 기본 WEBP_DOWNSCALE_FACTOR=0.85).
 */
export function roundSizes(base: Size, shrinks: number = WEBP_DOWNSCALE_MAX_ATTEMPTS, factor: number = WEBP_DOWNSCALE_FACTOR): Size[] {
  const sizes: Size[] = [{ width: base.width, height: base.height }];
  for (let k = 1; k <= shrinks; k += 1) {
    const scale = factor ** k;
    sizes.push({ width: Math.max(1, Math.round(base.width * scale)), height: Math.max(1, Math.round(base.height * scale)) });
  }
  return sizes;
}
