import type { Size } from './ImageTypes';
import type { CropWindow, QuarterTurns } from './PhotoEdit';
import type { Point } from './PhotoEditTransform';

/** 짧은 변이 사진 짧은 변의 이 비율 아래로 줄지 않는다(REQ-EDIT-013). */
export const MIN_CROP_FRACTION = 0.1;

/**
 * 편집기 화면에서 쓰는 자르기 영역: **돌린 사진**의 가로·세로에 대한 0~1 비율(중심과 크기 모두).
 * 편집값(CropWindow)은 중심이 회전 전 원본 기준이라 `cropRectToWindow`/`windowToCropRect`로 바꾼다.
 */
export type CropRect = { centerX: number; centerY: number; width: number; height: number };

/** 화면에 보이는 순서(REQ-EDIT-010). 처음 선택은 'free'. */
export const ASPECT_KEYS = [
  'original',
  'free',
  '1:1',
  '4:5',
  '5:4',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
] as const;
export type AspectKey = (typeof ASPECT_KEYS)[number];

/** 고정 비율(가로/세로). 'free'는 null, 'original'은 돌린 사진의 가로세로 비율. */
export function aspectRatioOf(key: AspectKey, rotated: Size): number | null {
  void key;
  void rotated;
  throw new Error('not implemented');
}

/** 사진 안에서 가운데에 가장 크게 들어가는 해당 비율의 영역. 비율이 null이면 전체. */
export function fitLargestCrop(rotated: Size, ratio: number | null): CropRect {
  void rotated;
  void ratio;
  throw new Error('not implemented');
}

/** 비율 단위 이동량(dx, dy)만큼 옮기되 사진 밖으로 나가지 않게 한다. */
export function moveCrop(rect: CropRect, dx: number, dy: number): CropRect {
  void rect;
  void dx;
  void dy;
  throw new Error('not implemented');
}

export type CropHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * 모서리 손잡이를 (dx, dy)(비율 단위)만큼 끌어 크기를 바꾼다. 반대쪽 모서리는 고정이다.
 * 사진 밖으로 나가지 않고, 짧은 변이 MIN_CROP_FRACTION(사진 짧은 변 기준) 아래로 줄지 않으며, ratio가 있으면 비율을 유지한다.
 */
export function resizeCrop(args: {
  rect: CropRect;
  handle: CropHandle;
  dx: number;
  dy: number;
  rotated: Size;
  ratio: number | null;
}): CropRect {
  void args;
  throw new Error('not implemented');
}

/** 화면용 영역(돌린 사진 기준)을 편집값으로: 중심은 회전 전 원본 비율로, 크기는 돌린 비율 그대로. */
export function cropRectToWindow(rect: CropRect, quarterTurns: QuarterTurns): CropWindow {
  void rect;
  void quarterTurns;
  throw new Error('not implemented');
}

export function windowToCropRect(window: CropWindow, quarterTurns: QuarterTurns): CropRect {
  void window;
  void quarterTurns;
  throw new Error('not implemented');
}

/** 사진 전체가 viewport 안에 들어가는 배율(fit). */
export function fitScale(image: Size, viewport: Size): number {
  void image;
  void viewport;
  throw new Error('not implemented');
}

/** 사진 픽셀 좌표 <-> 화면 좌표(사진을 viewport 가운데에 fit 배율로 놓았을 때). */
export function imageToScreen(point: Point, image: Size, viewport: Size): Point {
  void point;
  void image;
  void viewport;
  throw new Error('not implemented');
}

export function screenToImage(point: Point, image: Size, viewport: Size): Point {
  void point;
  void image;
  void viewport;
  throw new Error('not implemented');
}

/** 자르기 화면의 크기: 사진이 보이는 크기에 손잡이 여백(양쪽 각 handleInset)만 더한 크기. */
export function cropViewSize(image: Size, viewport: Size, handleInset: number): Size {
  void image;
  void viewport;
  void handleInset;
  throw new Error('not implemented');
}
