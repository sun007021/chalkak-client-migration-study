export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/** 핀치 배율을 1~4로 맞춘다. */
export function clampScale(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** 손을 떼면 돌아갈 배율(항상 1). */
export function releasedScale(_scale: number): number {
  return MIN_ZOOM;
}

// -0이 새어 나가지 않게 0을 더한다.
const limit = (value: number, bound: number): number =>
  Math.min(bound, Math.max(-bound, value)) + 0;

/** 확대한 이미지가 컨테이너 밖으로 벗어나지 않는 범위로 이동량을 맞춘다. */
export function clampPan(pan: Point, scale: number, container: Size): Point {
  const factor = Math.max(0, scale - 1) / 2;
  return {
    x: limit(pan.x, container.width * factor),
    y: limit(pan.y, container.height * factor),
  };
}

/**
 * 손가락 아래 지점(focal, 컨테이너 좌표)이 확대 전후 같은 화면 위치에 있도록 하는 이동량.
 * 변환은 `translate(pan) -> scale`(원점은 컨테이너 중심)이다.
 */
export function panForFocalPoint(
  focal: Point,
  fromScale: number,
  toScale: number,
  fromPan: Point,
  container: Size,
): Point {
  const fx = focal.x - container.width / 2;
  const fy = focal.y - container.height / 2;
  const ratio = toScale / fromScale;
  return { x: fx - ratio * (fx - fromPan.x), y: fy - ratio * (fy - fromPan.y) };
}
