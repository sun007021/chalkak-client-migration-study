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
  if (key === 'free') return null;
  if (key === 'original') return rotated.width / rotated.height;
  const [w, h] = key.split(':').map(Number);
  return w / h;
}

/** 사진 안에서 가운데에 가장 크게 들어가는 해당 비율의 영역. 비율이 null이면 전체. */
export function fitLargestCrop(rotated: Size, ratio: number | null): CropRect {
  if (ratio === null) return { centerX: 0.5, centerY: 0.5, width: 1, height: 1 };
  const imageRatio = rotated.width / rotated.height;
  if (ratio > imageRatio) {
    return { centerX: 0.5, centerY: 0.5, width: 1, height: imageRatio / ratio };
  }
  return { centerX: 0.5, centerY: 0.5, width: ratio / imageRatio, height: 1 };
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** 비율 단위 이동량(dx, dy)만큼 옮기되 사진 밖으로 나가지 않게 한다. */
export function moveCrop(rect: CropRect, dx: number, dy: number): CropRect {
  return {
    ...rect,
    centerX: clamp(rect.centerX + dx, rect.width / 2, 1 - rect.width / 2),
    centerY: clamp(rect.centerY + dy, rect.height / 2, 1 - rect.height / 2),
  };
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
  const { rect, handle, dx, dy, rotated, ratio } = args;
  const isLeft = handle === 'top-left' || handle === 'bottom-left';
  const isTop = handle === 'top-left' || handle === 'top-right';
  const left = rect.centerX - rect.width / 2;
  const right = rect.centerX + rect.width / 2;
  const top = rect.centerY - rect.height / 2;
  const bottom = rect.centerY + rect.height / 2;
  const anchorX = isLeft ? right : left;
  const anchorY = isTop ? bottom : top;
  const cornerX = clamp((isLeft ? left : right) + dx, 0, 1);
  const cornerY = clamp((isTop ? top : bottom) + dy, 0, 1);
  const availW = isLeft ? anchorX : 1 - anchorX;
  const availH = isTop ? anchorY : 1 - anchorY;
  const minPx = MIN_CROP_FRACTION * Math.min(rotated.width, rotated.height);

  let widthFrac = Math.max(0, isLeft ? anchorX - cornerX : cornerX - anchorX);
  let heightFrac = Math.max(0, isTop ? anchorY - cornerY : cornerY - anchorY);

  if (ratio === null) {
    widthFrac = clamp(widthFrac, Math.min(minPx / rotated.width, availW), availW);
    heightFrac = clamp(heightFrac, Math.min(minPx / rotated.height, availH), availH);
  } else {
    // 비율 직선(ratio, 1)에 끌고 있는 크기를 투영한다.
    const pw = widthFrac * rotated.width;
    const ph = heightFrac * rotated.height;
    let t = (pw * ratio + ph) / (ratio * ratio + 1);
    const maxT = Math.min((availW * rotated.width) / ratio, availH * rotated.height);
    const minT = Math.max(minPx / ratio, minPx);
    t = Math.min(Math.max(t, Math.min(minT, maxT)), maxT);
    widthFrac = (t * ratio) / rotated.width;
    heightFrac = t / rotated.height;
  }

  const newLeft = isLeft ? anchorX - widthFrac : anchorX;
  const newTop = isTop ? anchorY - heightFrac : anchorY;
  return {
    centerX: newLeft + widthFrac / 2,
    centerY: newTop + heightFrac / 2,
    width: widthFrac,
    height: heightFrac,
  };
}

/** 화면용 영역(돌린 사진 기준)을 편집값으로: 중심은 회전 전 원본 비율로, 크기는 돌린 비율 그대로. */
export function cropRectToWindow(rect: CropRect, quarterTurns: QuarterTurns): CropWindow {
  const { centerX: x, centerY: y, width, height } = rect;
  switch (quarterTurns) {
    case 0:
      return { centerX: x, centerY: y, width, height };
    case 1:
      return { centerX: y, centerY: 1 - x, width, height };
    case 2:
      return { centerX: 1 - x, centerY: 1 - y, width, height };
    case 3:
      return { centerX: 1 - y, centerY: x, width, height };
  }
}

export function windowToCropRect(window: CropWindow, quarterTurns: QuarterTurns): CropRect {
  const { centerX: ox, centerY: oy, width, height } = window;
  switch (quarterTurns) {
    case 0:
      return { centerX: ox, centerY: oy, width, height };
    case 1:
      return { centerX: 1 - oy, centerY: ox, width, height };
    case 2:
      return { centerX: 1 - ox, centerY: 1 - oy, width, height };
    case 3:
      return { centerX: oy, centerY: 1 - ox, width, height };
  }
}

/** 사진 전체가 viewport 안에 들어가는 배율(fit). */
export function fitScale(image: Size, viewport: Size): number {
  return Math.min(viewport.width / image.width, viewport.height / image.height);
}

/** fit 배율로 놓았을 때 보이는 크기(나눗셈 순서로 부동소수 오차를 줄인다). */
function fittedSize(image: Size, viewport: Size): Size {
  if (viewport.width / viewport.height <= image.width / image.height) {
    return { width: viewport.width, height: (image.height * viewport.width) / image.width };
  }
  return { width: (image.width * viewport.height) / image.height, height: viewport.height };
}

/** 사진 픽셀 좌표 <-> 화면 좌표(사진을 viewport 가운데에 fit 배율로 놓았을 때). */
export function imageToScreen(point: Point, image: Size, viewport: Size): Point {
  const scale = fitScale(image, viewport);
  return {
    x: (viewport.width - image.width * scale) / 2 + point.x * scale,
    y: (viewport.height - image.height * scale) / 2 + point.y * scale,
  };
}

export function screenToImage(point: Point, image: Size, viewport: Size): Point {
  const scale = fitScale(image, viewport);
  return {
    x: (point.x - (viewport.width - image.width * scale) / 2) / scale,
    y: (point.y - (viewport.height - image.height * scale) / 2) / scale,
  };
}

/** 자르기 화면의 크기: 사진이 보이는 크기에 손잡이 여백(양쪽 각 handleInset)만 더한 크기. */
export function cropViewSize(image: Size, viewport: Size, handleInset: number): Size {
  const fitted = fittedSize(image, viewport);
  return { width: fitted.width + 2 * handleInset, height: fitted.height + 2 * handleInset };
}
