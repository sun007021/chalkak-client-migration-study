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
export function clampZoomScale(_scale: number): number {
  throw new Error('not implemented');
}

/** 핀치 중 배율: clamp(시작 배율 × 현재 두 손가락 거리 / 시작 거리). 시작 거리가 0 이하이면 시작 배율(맞춤). */
export function pinchScale(_startScale: number, _startDistance: number, _currentDistance: number): number {
  throw new Error('not implemented');
}

/**
 * 확대한 이미지의 이동량을 확대된 범위 안으로 제한한다(REQ-FEED-011). 이동량은 이미지 중심 기준 translate(px)이고
 * 한 축의 최대값은 (scale - 1) × size / 2다. 배율 1이면 항상 (0, 0).
 */
export function clampPan(_translate: Point, _scale: number, _size: Size): Point {
  throw new Error('not implemented');
}

/**
 * 손가락 아래 지점이 고정되도록 새 배율의 translate를 계산한다(REQ-FEED-012). focal은 이미지 중심 기준 손가락 위치(px),
 * transform은 `translate(t) scale(s)`(원점 중심)이다. 결과는 clampPan을 거친다.
 */
export function zoomAroundPoint(_args: { focal: Point; translate: Point; fromScale: number; toScale: number; size: Size }): Point {
  throw new Error('not implemented');
}

/** 손을 떼면 원래 크기·위치로 돌아온다. */
export function releaseZoom(): { scale: number; translate: Point } {
  throw new Error('not implemented');
}
