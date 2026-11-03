import type { CropRegion, PhotoEdit } from '../editModel';
import type { Size } from '../imageSizing';

/**
 * 자르기 기하(순수 계산). 좌표 약속:
 * - `Size`/`Point`의 px는 디코드한 원본(EXIF 반영, 회전 전)의 픽셀이다. `CropRect`와 `Point`(비율)는 "90도씩 돌린 사진" 기준 0~1이다.
 * - `CropRegion`(저장하는 편집값)은 centerX/Y가 회전 전 원본 비율, width/height가 돌린 사진 비율이다(부록 '편집값 모델과 좌표').
 */

export interface Point {
  x: number;
  y: number;
}

/** 돌린 사진 기준 자르기 영역(중심 단위 좌표, 0~1). 화면 프레임이 직접 다루는 값. */
export interface CropRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export const FULL_RECT: CropRect = { centerX: 0.5, centerY: 0.5, width: 1, height: 1 };

/** 자르기 영역의 짧은 변은 사진 짧은 변의 이 비율 아래로 줄지 않는다(REQ-EDIT-013). */
export const MIN_CROP_FRACTION = 0.1;

export type QuarterTurns = 0 | 1 | 2 | 3;

/** 90도씩 돌린 사진의 크기. 홀수 회전이면 가로세로가 바뀐다. */
export function rotatedSize(size: Size, turns: QuarterTurns): Size {
  return turns % 2 === 1 ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}

/** 돌린 사진의 점 (xr, yr)을 원본 W×H의 점으로(부록): 0회전 (xr,yr), 1회전 (yr, H−xr), 2회전 (W−xr, H−yr), 3회전 (W−yr, xr). size = 원본 W×H. */
export function rotatedPointToSource(size: Size, turns: QuarterTurns, point: Point): Point {
  const { width: w, height: h } = size;
  switch (turns) {
    case 0:
      return { x: point.x, y: point.y };
    case 1:
      return { x: point.y, y: h - point.x };
    case 2:
      return { x: w - point.x, y: h - point.y };
    default:
      return { x: w - point.y, y: point.x };
  }
}

/** 돌린 사진 기준 영역 → 저장용 CropRegion(중심만 원본 비율로 바뀌고 width/height는 그대로). */
export function rectToCropRegion(size: Size, turns: QuarterTurns, rect: CropRect): CropRegion {
  const rotated = rotatedSize(size, turns);
  const source = rotatedPointToSource(size, turns, { x: rect.centerX * rotated.width, y: rect.centerY * rotated.height });
  return { centerX: source.x / size.width, centerY: source.y / size.height, width: rect.width, height: rect.height };
}

/** rectToCropRegion의 역. */
export function cropRegionToRect(size: Size, turns: QuarterTurns, crop: CropRegion): CropRect {
  const rotated = rotatedSize(size, turns);
  const x = crop.centerX * size.width;
  const y = crop.centerY * size.height;
  let xr: number;
  let yr: number;
  switch (turns) {
    case 0:
      xr = x;
      yr = y;
      break;
    case 1:
      xr = size.height - y;
      yr = x;
      break;
    case 2:
      xr = size.width - x;
      yr = size.height - y;
      break;
    default:
      xr = y;
      yr = size.width - x;
  }
  return { centerX: xr / rotated.width, centerY: yr / rotated.height, width: crop.width, height: crop.height };
}

/** 자른 결과 크기 = round(돌린 가로 × width), round(돌린 세로 × height), 각 변 최소 1. */
export function cropOutputSize(size: Size, turns: QuarterTurns, crop: CropRegion): Size {
  const rotated = rotatedSize(size, turns);
  return { width: Math.max(1, Math.round(rotated.width * crop.width)), height: Math.max(1, Math.round(rotated.height * crop.height)) };
}

/** 자르기 영역의 중심(원본 px). */
export function cropCenterPx(size: Size, _turns: QuarterTurns, crop: CropRegion): Point {
  return { x: crop.centerX * size.width, y: crop.centerY * size.height };
}

/** 렌더 계획: 먼저 turns만큼 돌린 사진에서 rotatedRect(px, 반올림한 정수)를 잘라 output 크기로 만든다. */
export interface GeometryPlan {
  quarterTurns: QuarterTurns;
  rotatedRect: { x: number; y: number; width: number; height: number };
  output: Size;
}

/** size = 디코드한 원본 크기(긴 변 4096 이하). 자르기가 전체이면 rotatedRect가 돌린 사진 전체이고 output이 돌린 크기다. */
export function planGeometry(size: Size, edit: Pick<PhotoEdit, 'quarterTurns' | 'crop'>): GeometryPlan {
  const rotated = rotatedSize(size, edit.quarterTurns);
  const output = cropOutputSize(size, edit.quarterTurns, edit.crop);
  const rect = cropRegionToRect(size, edit.quarterTurns, edit.crop);
  const width = Math.min(output.width, rotated.width);
  const height = Math.min(output.height, rotated.height);
  const x = Math.min(Math.max(0, Math.round(rect.centerX * rotated.width - width / 2)), rotated.width - width);
  const y = Math.min(Math.max(0, Math.round(rect.centerY * rotated.height - height / 2)), rotated.height - height);
  return { quarterTurns: edit.quarterTurns, rotatedRect: { x, y, width, height }, output: { width, height } };
}

// ── 비율 ──

/** 보이는 순서(REQ-EDIT-010). 처음 선택은 'free'. */
export const CROP_RATIO_IDS = ['original', 'free', '1-1', '4-5', '5-4', '3-4', '4-3', '9-16', '16-9'] as const;
export type CropRatioId = (typeof CROP_RATIO_IDS)[number];

/** 고정 비율의 가로:세로. original과 free는 없다. */
export const FIXED_RATIOS: Readonly<Partial<Record<CropRatioId, readonly [number, number]>>> = {
  '1-1': [1, 1],
  '4-5': [4, 5],
  '5-4': [5, 4],
  '3-4': [3, 4],
  '4-3': [4, 3],
  '9-16': [9, 16],
  '16-9': [16, 9],
};

/** 비율 값 = 가로 / 세로. 'original'은 지금 돌린 사진의 가로세로 비율(REQ-EDIT-012), 'free'는 null(고정 없음). rotated = 돌린 사진 크기. */
export function ratioValue(id: CropRatioId, rotated: Size): number | null {
  if (id === 'original') return rotated.width / rotated.height;
  const fixed = FIXED_RATIOS[id];
  return fixed ? fixed[0] / fixed[1] : null;
}

/** 사진 안에 가장 크게 들어가는 ratio(가로/세로) 영역, 사진 가운데(REQ-EDIT-011). image = 돌린 사진 px 크기. */
export function largestRect(image: Size, ratio: number): CropRect {
  const imageRatio = image.width / image.height;
  if (ratio >= imageRatio) return { centerX: 0.5, centerY: 0.5, width: 1, height: imageRatio / ratio };
  return { centerX: 0.5, centerY: 0.5, width: ratio / imageRatio, height: 1 };
}

/** 영역을 사진 안으로 옮기고 최소 크기(짧은 변 ≥ 0.1 × 사진 짧은 변)를 지킨다. ratio가 있으면 가로/세로 비율을 유지한다. */
export function clampRect(rect: CropRect, image: Size, ratio: number | null): CropRect {
  const minPx = MIN_CROP_FRACTION * Math.min(image.width, image.height);
  let w = rect.width * image.width;
  let h = rect.height * image.height;
  if (ratio) {
    w = Math.max(w, h * ratio);
    const minW = ratio >= 1 ? minPx * ratio : minPx;
    const maxW = Math.min(image.width, image.height * ratio);
    w = Math.min(maxW, Math.max(minW, w));
    h = w / ratio;
  } else {
    w = Math.min(image.width, Math.max(minPx, w));
    h = Math.min(image.height, Math.max(minPx, h));
  }
  return placeInside({ x: rect.centerX * image.width, y: rect.centerY * image.height }, w, h, image);
}

export type CropHandle = 'move' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * 끌기 한 번의 결과(순수). start = 끌기 시작 때의 영역, delta = 시작점에서 지금까지의 이동량(돌린 사진 비율 단위).
 * - 'move': 크기는 그대로 중심만 옮기고 사진 밖으로 나가지 않게 막는다.
 * - 모서리: 반대쪽 모서리를 고정하고 끄는 모서리를 delta만큼 옮긴다. 사진 밖으로 나가지 않고 짧은 변이 최소 크기 아래로 줄지 않는다.
 *   ratio가 있으면 비율을 유지한다: 너비(px) = max(|끈 가로|, |끈 세로| × ratio)로 정한 뒤 사진 경계와 최소 크기로 자른다.
 * 끌어서 반대쪽 모서리를 넘어가는 경우(뒤집힘)는 최소 크기로 본다.
 */
export function dragRect(start: CropRect, handle: CropHandle, delta: Point, image: Size, ratio: number | null): CropRect {
  const px = { x: delta.x * image.width, y: delta.y * image.height };
  const left = (start.centerX - start.width / 2) * image.width;
  const right = (start.centerX + start.width / 2) * image.width;
  const top = (start.centerY - start.height / 2) * image.height;
  const bottom = (start.centerY + start.height / 2) * image.height;
  if (handle === 'move') {
    return placeInside({ x: start.centerX * image.width + px.x, y: start.centerY * image.height + px.y }, start.width * image.width, start.height * image.height, image);
  }
  const draggedRight = handle === 'top-right' || handle === 'bottom-right';
  const draggedBottom = handle === 'bottom-left' || handle === 'bottom-right';
  const anchorX = draggedRight ? left : right;
  const anchorY = draggedBottom ? top : bottom;
  const cornerX = (draggedRight ? right : left) + px.x;
  const cornerY = (draggedBottom ? bottom : top) + px.y;
  let w = draggedRight ? cornerX - anchorX : anchorX - cornerX;
  let h = draggedBottom ? cornerY - anchorY : anchorY - cornerY;
  const maxW = draggedRight ? image.width - anchorX : anchorX;
  const maxH = draggedBottom ? image.height - anchorY : anchorY;
  const minPx = MIN_CROP_FRACTION * Math.min(image.width, image.height);
  if (ratio) {
    w = Math.max(w, h * ratio);
    const minW = ratio >= 1 ? minPx * ratio : minPx;
    w = Math.min(Math.min(maxW, maxH * ratio), Math.max(minW, w));
    h = w / ratio;
  } else {
    w = Math.min(maxW, Math.max(minPx, w));
    h = Math.min(maxH, Math.max(minPx, h));
  }
  const x0 = draggedRight ? anchorX : anchorX - w;
  const y0 = draggedBottom ? anchorY : anchorY - h;
  return { centerX: (x0 + w / 2) / image.width, centerY: (y0 + h / 2) / image.height, width: w / image.width, height: h / image.height };
}

/** 시계 방향 90도 회전 때 영역을 사진과 함께 돌린다: (cx, cy, w, h) → (1 − cy, cx, h, w). */
export function rotateRectClockwise(rect: CropRect): CropRect {
  return { centerX: 1 - rect.centerY, centerY: rect.centerX, width: rect.height, height: rect.width };
}

/**
 * "90도 회전" 뒤의 새 영역(REQ-EDIT-014, 015). newImage = 돌린 뒤 사진 px 크기.
 * - 'original': 새 사진 전체(비율이 새 사진 비율로 바뀐다). 명시한 고정 비율(1:1, 4:5, …): 같은 비율로 새 사진에서 다시 가장 크게.
 * - 'free': 영역이 사진과 함께 돈다(rotateRectClockwise). 전체였으면 새 사진 전체.
 */
export function rotateCrop(rect: CropRect, ratioId: CropRatioId, newImage: Size): CropRect {
  if (ratioId === 'original') return { ...FULL_RECT };
  const fixed = FIXED_RATIOS[ratioId];
  if (fixed) return largestRect(newImage, fixed[0] / fixed[1]);
  return rotateRectClockwise(rect);
}

// ── 화면 좌표 ──

/** 화면 영역 안에 사진 전체가 들어가는 배율(px당 화면 단위) = min(영역 가로/사진 가로, 영역 세로/사진 세로). */
export function fitScale(container: Size, image: Size): number {
  return Math.min(container.width / image.width, container.height / image.height);
}

/** 사진 px ↔ 화면 좌표. 화면 원점은 사진 왼쪽 위가 놓인 곳(offset). */
export function imageToScreen(point: Point, scale: number, offset: Point): Point {
  return { x: point.x * scale + offset.x, y: point.y * scale + offset.y };
}
export function screenToImage(point: Point, scale: number, offset: Point): Point {
  return { x: (point.x - offset.x) / scale, y: (point.y - offset.y) / scale };
}

/** 자르기 화면 크기 = 사진이 보이는 크기(사진 × scale)에 손잡이 여백을 양쪽으로 더한 크기. */
export function cropViewSize(image: Size, scale: number, handlePadding: number): Size {
  return { width: image.width * scale + handlePadding * 2, height: image.height * scale + handlePadding * 2 };
}

/** 중심 px에 w×h px 영역을 놓되 사진 밖으로 나가지 않게 중심을 옮긴다. */
function placeInside(center: Point, w: number, h: number, image: Size): CropRect {
  const cx = Math.min(image.width - w / 2, Math.max(w / 2, center.x));
  const cy = Math.min(image.height - h / 2, Math.max(h / 2, center.y));
  return { centerX: cx / image.width, centerY: cy / image.height, width: w / image.width, height: h / image.height };
}
