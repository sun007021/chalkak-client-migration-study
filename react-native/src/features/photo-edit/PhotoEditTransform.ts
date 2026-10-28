import type { Size } from './ImageTypes';
import type { CropWindow, QuarterTurns } from './PhotoEdit';

export type Point = { x: number; y: number };

/** 90도씩 돌린 사진의 크기(홀수 회전이면 가로세로가 바뀐다). */
export function rotatedSize(size: Size, quarterTurns: QuarterTurns): Size {
  void size;
  void quarterTurns;
  throw new Error('not implemented');
}

/** 돌린 사진의 점 (xr, yr)을 원본 W x H의 점으로: 0:(xr,yr), 1:(yr,H-xr), 2:(W-xr,H-yr), 3:(W-yr,xr). */
export function rotatedPointToOriginal(
  point: Point,
  quarterTurns: QuarterTurns,
  original: Size,
): Point {
  void point;
  void quarterTurns;
  void original;
  throw new Error('not implemented');
}

export type ResolvedCrop = {
  /** 원본 픽셀 기준 중심. */
  centerX: number;
  centerY: number;
  /** 자른 결과(돌린 방향)의 픽셀 크기. */
  outputWidth: number;
  outputHeight: number;
};

/** 편집값의 자르기를 원본 크기에 대한 픽셀 값으로 푼다(REQ-EDIT-002, TC-EDIT-016). */
export function resolveCrop(args: {
  source: Size;
  quarterTurns: QuarterTurns;
  crop: CropWindow;
}): ResolvedCrop {
  void args;
  throw new Error('not implemented');
}

/** 긴 변이 maxLongEdge를 넘으면 비율을 유지해 줄이고 어떤 경우에도 확대하지 않는다(REQ-UPL-027). */
export function limitLongEdge(size: Size, maxLongEdge: number): Size {
  void size;
  void maxLongEdge;
  throw new Error('not implemented');
}
