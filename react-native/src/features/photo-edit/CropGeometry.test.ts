import {
  ASPECT_KEYS,
  MIN_CROP_FRACTION,
  aspectRatioOf,
  cropRectToWindow,
  cropViewSize,
  fitLargestCrop,
  fitScale,
  imageToScreen,
  moveCrop,
  resizeCrop,
  screenToImage,
  windowToCropRect,
  type CropRect,
} from './CropGeometry';
import type { QuarterTurns } from './PhotoEdit';

const LANDSCAPE = { width: 4000, height: 3000 };
const FULL: CropRect = { centerX: 0.5, centerY: 0.5, width: 1, height: 1 };
const edges = (r: CropRect) => ({
  left: r.centerX - r.width / 2,
  right: r.centerX + r.width / 2,
  top: r.centerY - r.height / 2,
  bottom: r.centerY + r.height / 2,
});
/** 비율 영역이 가리키는 픽셀 가로/세로 비. */
const pixelRatio = (r: CropRect, size: { width: number; height: number }) =>
  (r.width * size.width) / (r.height * size.height);

describe('자르기 비율', () => {
  it('TC-EDIT-013 비율은 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 순서이고 세로·가로 짝을 모두 제공한다', () => {
    expect([...ASPECT_KEYS]).toEqual([
      'original',
      'free',
      '1:1',
      '4:5',
      '5:4',
      '3:4',
      '4:3',
      '9:16',
      '16:9',
    ]);
  });

  it('REQ-EDIT-010 고정 비율의 가로/세로 값, 자유는 null이다', () => {
    expect(aspectRatioOf('free', LANDSCAPE)).toBeNull();
    expect(aspectRatioOf('1:1', LANDSCAPE)).toBe(1);
    expect(aspectRatioOf('4:5', LANDSCAPE)).toBeCloseTo(0.8);
    expect(aspectRatioOf('5:4', LANDSCAPE)).toBeCloseTo(1.25);
    expect(aspectRatioOf('3:4', LANDSCAPE)).toBeCloseTo(0.75);
    expect(aspectRatioOf('4:3', LANDSCAPE)).toBeCloseTo(4 / 3);
    expect(aspectRatioOf('9:16', LANDSCAPE)).toBeCloseTo(9 / 16);
    expect(aspectRatioOf('16:9', LANDSCAPE)).toBeCloseTo(16 / 9);
  });

  it('REQ-EDIT-012 "원본" 비율은 지금 회전 방향의 사진 가로세로 비율이다', () => {
    expect(aspectRatioOf('original', LANDSCAPE)).toBeCloseTo(4 / 3);
    expect(aspectRatioOf('original', { width: 3000, height: 4000 })).toBeCloseTo(3 / 4);
  });
});

describe('fitLargestCrop', () => {
  it('REQ-EDIT-011 1:1은 4000x3000에서 높이를 꽉 채운 가운데 정사각형(가로 0.75)이다', () => {
    const r = fitLargestCrop(LANDSCAPE, 1);
    expect(r.centerX).toBeCloseTo(0.5);
    expect(r.centerY).toBeCloseTo(0.5);
    expect(r.width).toBeCloseTo(0.75);
    expect(r.height).toBeCloseTo(1);
  });

  it('REQ-EDIT-011 사진보다 세로로 긴 비율(9:16)은 높이를 채우고, 가로로 긴 비율(16:9)은 너비를 채운다', () => {
    const tall = fitLargestCrop(LANDSCAPE, 9 / 16);
    expect(tall.height).toBeCloseTo(1);
    expect(tall.width).toBeCloseTo((3000 * 9) / 16 / 4000);
    const wide = fitLargestCrop(LANDSCAPE, 16 / 9);
    expect(wide.width).toBeCloseTo(1);
    expect(wide.height).toBeCloseTo(2250 / 3000);
  });

  it('REQ-EDIT-011 비율이 null(자유)이면 전체다', () => {
    expect(fitLargestCrop(LANDSCAPE, null)).toEqual(FULL);
  });

  it.each([1, 0.8, 1.25, 0.75, 4 / 3, 9 / 16, 16 / 9])(
    'TC-EDIT-014 비율 %f로 다시 시작한 영역은 그 비율을 정확히 지키고 사진 안에 있다',
    (ratio) => {
      const r = fitLargestCrop(LANDSCAPE, ratio);
      expect(pixelRatio(r, LANDSCAPE)).toBeCloseTo(ratio, 6);
      const e = edges(r);
      expect(e.left).toBeGreaterThanOrEqual(-1e-9);
      expect(e.right).toBeLessThanOrEqual(1 + 1e-9);
      expect(e.top).toBeGreaterThanOrEqual(-1e-9);
      expect(e.bottom).toBeLessThanOrEqual(1 + 1e-9);
    },
  );
});

describe('moveCrop', () => {
  const half: CropRect = { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 };

  it('TC-EDIT-018 끌어서 옮긴다', () => {
    const r = moveCrop(half, 0.1, -0.1);
    expect(r.centerX).toBeCloseTo(0.6);
    expect(r.centerY).toBeCloseTo(0.4);
    expect(r.width).toBe(0.5);
    expect(r.height).toBe(0.5);
  });

  it('TC-EDIT-018 사진 밖으로 나가지 않는다(경계에서 멈춘다)', () => {
    const right = moveCrop(half, 0.9, 0);
    expect(edges(right).right).toBeCloseTo(1);
    const topLeft = moveCrop(half, -2, -2);
    expect(edges(topLeft).left).toBeCloseTo(0);
    expect(edges(topLeft).top).toBeCloseTo(0);
  });

  it('TC-EDIT-018 전체 영역은 움직이지 않는다', () => {
    expect(moveCrop(FULL, 0.3, 0.3)).toEqual(FULL);
  });
});

describe('resizeCrop', () => {
  const args = { rotated: LANDSCAPE, ratio: null as number | null };

  it('TC-EDIT-018 모서리를 끌면 반대쪽 모서리는 고정이고 그 모서리만 움직인다', () => {
    const r = resizeCrop({ ...args, rect: FULL, handle: 'top-left', dx: 0.2, dy: 0.1 });
    const e = edges(r);
    expect(e.left).toBeCloseTo(0.2);
    expect(e.top).toBeCloseTo(0.1);
    expect(e.right).toBeCloseTo(1);
    expect(e.bottom).toBeCloseTo(1);
  });

  it('TC-EDIT-018 사진 밖으로 키울 수 없다', () => {
    const inner: CropRect = { centerX: 0.75, centerY: 0.75, width: 0.5, height: 0.5 };
    const r = resizeCrop({ ...args, rect: inner, handle: 'bottom-right', dx: 0.5, dy: 0.5 });
    const e = edges(r);
    expect(e.right).toBeLessThanOrEqual(1 + 1e-9);
    expect(e.bottom).toBeLessThanOrEqual(1 + 1e-9);
    const out = resizeCrop({ ...args, rect: inner, handle: 'top-left', dx: -2, dy: -2 });
    expect(edges(out).left).toBeGreaterThanOrEqual(-1e-9);
    expect(edges(out).top).toBeGreaterThanOrEqual(-1e-9);
  });

  it('TC-EDIT-018 최소 크기 아래로 줄지 않는다: 각 변이 사진 짧은 변의 0.1배(300px) 이상이다', () => {
    expect(MIN_CROP_FRACTION).toBe(0.1);
    const r = resizeCrop({ ...args, rect: FULL, handle: 'top-left', dx: 5, dy: 5 });
    expect(r.width * LANDSCAPE.width).toBeGreaterThanOrEqual(300 - 1e-6);
    expect(r.height * LANDSCAPE.height).toBeGreaterThanOrEqual(300 - 1e-6);
    // 반대쪽 모서리는 고정
    expect(edges(r).right).toBeCloseTo(1);
    expect(edges(r).bottom).toBeCloseTo(1);
  });

  it('TC-EDIT-018 고정 비율에서는 끄는 동안 비율이 유지되고 반대쪽 모서리가 고정이다', () => {
    const shrunk = resizeCrop({
      rect: { centerX: 0.4, centerY: 0.5, width: 0.375, height: 0.5 },
      handle: 'bottom-right',
      dx: -0.05,
      dy: 0.0,
      rotated: LANDSCAPE,
      ratio: 1,
    });
    expect(pixelRatio(shrunk, LANDSCAPE)).toBeCloseTo(1, 6);
    expect(edges(shrunk).left).toBeCloseTo(0.4 - 0.1875);
    expect(edges(shrunk).top).toBeCloseTo(0.25);
    const grown = resizeCrop({
      rect: { centerX: 0.3, centerY: 0.3, width: 0.25, height: (0.25 * 4000) / 3000 },
      handle: 'bottom-right',
      dx: 0.9,
      dy: 0.9,
      rotated: LANDSCAPE,
      ratio: 1,
    });
    expect(pixelRatio(grown, LANDSCAPE)).toBeCloseTo(1, 6);
    expect(edges(grown).right).toBeLessThanOrEqual(1 + 1e-9);
    expect(edges(grown).bottom).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('화면용 영역 <-> 편집값 변환', () => {
  it('TC-EDIT-016 돌린 사진의 왼쪽 절반(1회전)은 CropWindow(0.5, 0.75, 0.5, 1)다', () => {
    const w = cropRectToWindow({ centerX: 0.25, centerY: 0.5, width: 0.5, height: 1 }, 1);
    expect(w.centerX).toBeCloseTo(0.5);
    expect(w.centerY).toBeCloseTo(0.75);
    expect(w.width).toBeCloseTo(0.5);
    expect(w.height).toBeCloseTo(1);
  });

  it.each([
    [0, { centerX: 0.25, centerY: 0.5 }],
    [1, { centerX: 0.5, centerY: 0.75 }],
    [2, { centerX: 0.75, centerY: 0.5 }],
    [3, { centerX: 0.5, centerY: 0.25 }],
  ] as [QuarterTurns, { centerX: number; centerY: number }][])(
    'REQ-EDIT-002 %i회전: 돌린 사진의 왼쪽 절반 중심은 원본 비율 %j로 바뀌고 크기는 그대로다',
    (turns, center) => {
      const w = cropRectToWindow({ centerX: 0.25, centerY: 0.5, width: 0.5, height: 1 }, turns);
      expect(w.centerX).toBeCloseTo(center.centerX);
      expect(w.centerY).toBeCloseTo(center.centerY);
      expect(w.width).toBe(0.5);
      expect(w.height).toBe(1);
    },
  );

  it.each([0, 1, 2, 3] as QuarterTurns[])(
    '%i회전에서 windowToCropRect는 cropRectToWindow의 역이다',
    (turns) => {
      const rect: CropRect = { centerX: 0.3, centerY: 0.6, width: 0.4, height: 0.7 };
      const back = windowToCropRect(cropRectToWindow(rect, turns), turns);
      expect(back.centerX).toBeCloseTo(rect.centerX, 9);
      expect(back.centerY).toBeCloseTo(rect.centerY, 9);
      expect(back.width).toBe(rect.width);
      expect(back.height).toBe(rect.height);
    },
  );

  it.each([0, 1, 2, 3] as QuarterTurns[])(
    '전체 영역은 %i회전에서도 전체 자르기(0.5, 0.5, 1, 1)다',
    (turns) => {
      expect(cropRectToWindow(FULL, turns)).toEqual({
        centerX: 0.5,
        centerY: 0.5,
        width: 1,
        height: 1,
      });
    },
  );
});

describe('좌표 변환', () => {
  const viewport = { width: 400, height: 600 };

  it('TC-EDIT-019 fitScale은 사진 전체가 viewport 안에 들어가는 배율이다', () => {
    expect(fitScale(LANDSCAPE, viewport)).toBeCloseTo(0.1);
    expect(fitScale(LANDSCAPE, { width: 1000, height: 500 })).toBeCloseTo(500 / 3000);
  });

  it('TC-EDIT-019 사진 좌표 <-> 화면 좌표 왕복 오차가 1e-6 이하다', () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 4000, y: 3000 },
      { x: 1234.5, y: 678.9 },
    ]) {
      const back = screenToImage(imageToScreen(point, LANDSCAPE, viewport), LANDSCAPE, viewport);
      expect(Math.abs(back.x - point.x)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(back.y - point.y)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('TC-EDIT-019 사진은 viewport 가운데에 놓인다(사진 중심 = viewport 중심)', () => {
    const center = imageToScreen({ x: 2000, y: 1500 }, LANDSCAPE, viewport);
    expect(center.x).toBeCloseTo(200);
    expect(center.y).toBeCloseTo(300);
    const topLeft = imageToScreen({ x: 0, y: 0 }, LANDSCAPE, viewport);
    expect(topLeft.x).toBeCloseTo(0);
    expect(topLeft.y).toBeCloseTo(150);
  });

  it('TC-EDIT-019 자르기 화면 크기는 사진이 보이는 크기에 손잡이 여백(양쪽)만 더한 크기다', () => {
    expect(cropViewSize(LANDSCAPE, viewport, 24)).toEqual({ width: 400 + 48, height: 300 + 48 });
  });
});
