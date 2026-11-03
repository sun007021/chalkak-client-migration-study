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
export function rotatedSize(_size: Size, _turns: QuarterTurns): Size {
  throw new Error('not implemented');
}

/** 돌린 사진의 점 (xr, yr)을 원본 W×H의 점으로(부록): 0회전 (xr,yr), 1회전 (yr, H−xr), 2회전 (W−xr, H−yr), 3회전 (W−yr, xr). size = 원본 W×H. */
export function rotatedPointToSource(_size: Size, _turns: QuarterTurns, _point: Point): Point {
  throw new Error('not implemented');
}

/** 돌린 사진 기준 영역 → 저장용 CropRegion(중심만 원본 비율로 바뀌고 width/height는 그대로). */
export function rectToCropRegion(_size: Size, _turns: QuarterTurns, _rect: CropRect): CropRegion {
  throw new Error('not implemented');
}

/** rectToCropRegion의 역. */
export function cropRegionToRect(_size: Size, _turns: QuarterTurns, _crop: CropRegion): CropRect {
  throw new Error('not implemented');
}

/** 자른 결과 크기 = round(돌린 가로 × width), round(돌린 세로 × height), 각 변 최소 1. */
export function cropOutputSize(_size: Size, _turns: QuarterTurns, _crop: CropRegion): Size {
  throw new Error('not implemented');
}

/** 자르기 영역의 중심(원본 px). */
export function cropCenterPx(_size: Size, _turns: QuarterTurns, _crop: CropRegion): Point {
  throw new Error('not implemented');
}

/** 렌더 계획: 먼저 turns만큼 돌린 사진에서 rotatedRect(px, 반올림한 정수)를 잘라 output 크기로 만든다. */
export interface GeometryPlan {
  quarterTurns: QuarterTurns;
  rotatedRect: { x: number; y: number; width: number; height: number };
  output: Size;
}

/** size = 디코드한 원본 크기(긴 변 4096 이하). 자르기가 전체이면 rotatedRect가 돌린 사진 전체이고 output이 돌린 크기다. */
export function planGeometry(_size: Size, _edit: Pick<PhotoEdit, 'quarterTurns' | 'crop'>): GeometryPlan {
  throw new Error('not implemented');
}

// ── 비율 ──

/** 보이는 순서(REQ-EDIT-010). 처음 선택은 'free'. */
export const CROP_RATIO_IDS = ['original', 'free', '1-1', '4-5', '5-4', '3-4', '4-3', '9-16', '16-9'] as const;
export type CropRatioId = (typeof CROP_RATIO_IDS)[number];

/** 고정 비율의 가로:세로. original과 free는 없다. */
export const FIXED_RATIOS: Readonly<Partial<Record<CropRatioId, readonly [number, number]>>> = {};

/** 비율 값 = 가로 / 세로. 'original'은 지금 돌린 사진의 가로세로 비율(REQ-EDIT-012), 'free'는 null(고정 없음). rotated = 돌린 사진 크기. */
export function ratioValue(_id: CropRatioId, _rotated: Size): number | null {
  throw new Error('not implemented');
}

/** 사진 안에 가장 크게 들어가는 ratio(가로/세로) 영역, 사진 가운데(REQ-EDIT-011). image = 돌린 사진 px 크기. */
export function largestRect(_image: Size, _ratio: number): CropRect {
  throw new Error('not implemented');
}

/** 영역을 사진 안으로 옮기고 최소 크기(짧은 변 ≥ 0.1 × 사진 짧은 변)를 지킨다. ratio가 있으면 가로/세로 비율을 유지한다. */
export function clampRect(_rect: CropRect, _image: Size, _ratio: number | null): CropRect {
  throw new Error('not implemented');
}

export type CropHandle = 'move' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * 끌기 한 번의 결과(순수). start = 끌기 시작 때의 영역, delta = 시작점에서 지금까지의 이동량(돌린 사진 비율 단위).
 * - 'move': 크기는 그대로 중심만 옮기고 사진 밖으로 나가지 않게 막는다.
 * - 모서리: 반대쪽 모서리를 고정하고 끄는 모서리를 delta만큼 옮긴다. 사진 밖으로 나가지 않고 짧은 변이 최소 크기 아래로 줄지 않는다.
 *   ratio가 있으면 비율을 유지한다: 너비(px) = max(|끈 가로|, |끈 세로| × ratio)로 정한 뒤 사진 경계와 최소 크기로 자른다.
 * 끌어서 반대쪽 모서리를 넘어가는 경우(뒤집힘)는 최소 크기로 본다.
 */
export function dragRect(_start: CropRect, _handle: CropHandle, _delta: Point, _image: Size, _ratio: number | null): CropRect {
  throw new Error('not implemented');
}

/** 시계 방향 90도 회전 때 영역을 사진과 함께 돌린다: (cx, cy, w, h) → (1 − cy, cx, h, w). */
export function rotateRectClockwise(_rect: CropRect): CropRect {
  throw new Error('not implemented');
}

/**
 * "90도 회전" 뒤의 새 영역(REQ-EDIT-014, 015). newImage = 돌린 뒤 사진 px 크기.
 * - 'original': 새 사진 전체(비율이 새 사진 비율로 바뀐다). 명시한 고정 비율(1:1, 4:5, …): 같은 비율로 새 사진에서 다시 가장 크게.
 * - 'free': 영역이 사진과 함께 돈다(rotateRectClockwise). 전체였으면 새 사진 전체.
 */
export function rotateCrop(_rect: CropRect, _ratioId: CropRatioId, _newImage: Size): CropRect {
  throw new Error('not implemented');
}

// ── 화면 좌표 ──

/** 화면 영역 안에 사진 전체가 들어가는 배율(px당 화면 단위) = min(영역 가로/사진 가로, 영역 세로/사진 세로). */
export function fitScale(_container: Size, _image: Size): number {
  throw new Error('not implemented');
}

/** 사진 px ↔ 화면 좌표. 화면 원점은 사진 왼쪽 위가 놓인 곳(offset). */
export function imageToScreen(_point: Point, _scale: number, _offset: Point): Point {
  throw new Error('not implemented');
}
export function screenToImage(_point: Point, _scale: number, _offset: Point): Point {
  throw new Error('not implemented');
}

/** 자르기 화면 크기 = 사진이 보이는 크기(사진 × scale)에 손잡이 여백을 양쪽으로 더한 크기. */
export function cropViewSize(_image: Size, _scale: number, _handlePadding: number): Size {
  throw new Error('not implemented');
}
