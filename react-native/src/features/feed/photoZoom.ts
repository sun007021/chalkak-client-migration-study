export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/** 핀치 배율을 1~4로 맞춘다. */
export function clampScale(_scale: number): number {
  throw new Error('not implemented');
}

/** 손을 떼면 돌아갈 배율(항상 1). */
export function releasedScale(_scale: number): number {
  throw new Error('not implemented');
}

/** 확대한 이미지가 컨테이너 밖으로 벗어나지 않는 범위로 이동량을 맞춘다. */
export function clampPan(_pan: Point, _scale: number, _container: Size): Point {
  throw new Error('not implemented');
}

/**
 * 손가락 아래 지점(focal, 컨테이너 좌표)이 확대 전후 같은 화면 위치에 있도록 하는 이동량.
 * 변환은 `translate(pan) -> scale`(원점은 컨테이너 중심)이다.
 */
export function panForFocalPoint(
  _focal: Point,
  _fromScale: number,
  _toScale: number,
  _fromPan: Point,
  _container: Size,
): Point {
  throw new Error('not implemented');
}
