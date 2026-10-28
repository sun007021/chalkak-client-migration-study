export const MIN_ZOOM = 1;
/** 핀치(웹 데스크톱은 Ctrl+휠 등)로 확대할 수 있는 최대 배율(REQ-FEED-011). */
export const MAX_ZOOM = 4;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 배율을 [MIN_ZOOM, MAX_ZOOM]으로 맞춘다. NaN·Infinity는 MIN_ZOOM. */
export function clampZoomScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** 핀치 중 배율: clamp(시작 배율 × 현재 두 손가락 거리 / 시작 거리). 시작 거리가 0 이하이면 시작 배율(맞춤). */
export function pinchScale(startScale: number, startDistance: number, currentDistance: number): number {
  if (!(startDistance > 0)) return clampZoomScale(startScale);
  return clampZoomScale((startScale * currentDistance) / startDistance);
}

const limit = (value: number, max: number): number => (max <= 0 ? 0 : Math.min(max, Math.max(-max, value)) + 0);

/**
 * 확대한 이미지의 이동량을 확대된 범위 안으로 제한한다(REQ-FEED-011). 이동량은 이미지 중심 기준 translate(px)이고
 * 한 축의 최대값은 (scale - 1) × size / 2다. 배율 1이면 항상 (0, 0).
 */
export function clampPan(translate: Point, scale: number, size: Size): Point {
  const factor = Math.max(0, scale - 1) / 2;
  return { x: limit(translate.x, factor * size.width), y: limit(translate.y, factor * size.height) };
}

/**
 * 손가락 아래 지점이 고정되도록 새 배율의 translate를 계산한다(REQ-FEED-012). focal은 이미지 중심 기준 손가락 위치(px),
 * transform은 `translate(t) scale(s)`(원점 중심)이다. 결과는 clampPan을 거친다.
 */
export function zoomAroundPoint(args: { focal: Point; translate: Point; fromScale: number; toScale: number; size: Size }): Point {
  const { focal, translate, fromScale, size } = args;
  const toScale = clampZoomScale(args.toScale);
  // 내용 좌표 c = (focal - translate) / fromScale 가 새 배율에서도 focal 아래에 있어야 한다: translate' = focal - c × toScale.
  const next = {
    x: focal.x - ((focal.x - translate.x) / fromScale) * toScale,
    y: focal.y - ((focal.y - translate.y) / fromScale) * toScale,
  };
  return clampPan(next, toScale, size);
}

/** 손을 떼면 원래 크기·위치로 돌아온다. */
export function releaseZoom(): { scale: number; translate: Point } {
  return { scale: MIN_ZOOM, translate: { x: 0, y: 0 } };
}
