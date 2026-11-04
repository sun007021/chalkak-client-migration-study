import { FULL_CROP } from '../editModel';
import {
  CROP_RATIO_IDS,
  FIXED_RATIOS,
  FULL_RECT,
  MIN_CROP_FRACTION,
  clampRect,
  cropCenterPx,
  cropOutputSize,
  cropRegionToRect,
  cropViewSize,
  dragRect,
  fitScale,
  imageToScreen,
  largestRect,
  planGeometry,
  ratioValue,
  rectToCropRegion,
  rotateCrop,
  rotateRectClockwise,
  rotatedPointToSource,
  rotatedSize,
  screenToImage,
} from './cropGeometry';
import type { CropHandle, CropRect, QuarterTurns } from './cropGeometry';
import { seededRandom } from '../../../test/pixels';

const PHOTO = { width: 4000, height: 3000 };
const TURNS: QuarterTurns[] = [0, 1, 2, 3];
const px = (rect: CropRect, image: { width: number; height: number }) => ({ w: rect.width * image.width, h: rect.height * image.height });

function expectRectClose(actual: CropRect, expected: CropRect, label = ''): void {
  expect(actual.centerX, `${label} centerX`).toBeCloseTo(expected.centerX, 9);
  expect(actual.centerY, `${label} centerY`).toBeCloseTo(expected.centerY, 9);
  expect(actual.width, `${label} width`).toBeCloseTo(expected.width, 9);
  expect(actual.height, `${label} height`).toBeCloseTo(expected.height, 9);
}

function expectInside(rect: CropRect, label = ''): void {
  const eps = 1e-9;
  expect(rect.centerX - rect.width / 2, `${label} left`).toBeGreaterThanOrEqual(-eps);
  expect(rect.centerY - rect.height / 2, `${label} top`).toBeGreaterThanOrEqual(-eps);
  expect(rect.centerX + rect.width / 2, `${label} right`).toBeLessThanOrEqual(1 + eps);
  expect(rect.centerY + rect.height / 2, `${label} bottom`).toBeLessThanOrEqual(1 + eps);
}

describe('자르기 비율 (REQ-EDIT-010~012)', () => {
  it('TC-EDIT-013 비율은 원본, 자유, 1:1, 4:5, 5:4, 3:4, 4:3, 9:16, 16:9 순서다', () => {
    expect([...CROP_RATIO_IDS]).toEqual(['original', 'free', '1-1', '4-5', '5-4', '3-4', '4-3', '9-16', '16-9']);
  });

  it('TC-EDIT-013 고정 비율은 세로·가로 짝(4:5↔5:4, 3:4↔4:3, 9:16↔16:9)을 모두 제공한다', () => {
    expect(FIXED_RATIOS).toEqual({ '1-1': [1, 1], '4-5': [4, 5], '5-4': [5, 4], '3-4': [3, 4], '4-3': [4, 3], '9-16': [9, 16], '16-9': [16, 9] });
  });

  it('REQ-EDIT-012 원본 비율은 지금 돌린 사진의 가로/세로이고 자유는 고정 없음(null)이다', () => {
    expect(ratioValue('original', { width: 4000, height: 3000 })).toBeCloseTo(4 / 3, 12);
    expect(ratioValue('original', { width: 3000, height: 4000 })).toBeCloseTo(3 / 4, 12);
    expect(ratioValue('free', PHOTO)).toBeNull();
    expect(ratioValue('4-5', PHOTO)).toBeCloseTo(0.8, 12);
    expect(ratioValue('5-4', PHOTO)).toBeCloseTo(1.25, 12);
    expect(ratioValue('16-9', PHOTO)).toBeCloseTo(16 / 9, 12);
  });

  it('REQ-EDIT-011 사진 안에 가장 크게 들어가는 영역은 사진 가운데에 놓이고 비율이 정확하다', () => {
    const square = largestRect(PHOTO, 1); // 3000×3000 px
    expect(square.width).toBeCloseTo(0.75, 12);
    expect(square.height).toBeCloseTo(1, 12);
    expect(square.centerX).toBeCloseTo(0.5, 12);
    expect(square.centerY).toBeCloseTo(0.5, 12);
    const wide = largestRect(PHOTO, 16 / 9); // 4000×2250 px
    expect(wide.width).toBeCloseTo(1, 12);
    expect(wide.height).toBeCloseTo(0.75, 12);
    const tall = largestRect(PHOTO, 9 / 16); // 1687.5×3000 px
    expect(tall.width).toBeCloseTo(0.421875, 12);
    expect(tall.height).toBeCloseTo(1, 12);
    for (const r of [0.8, 1.25, 0.75, 4 / 3]) {
      const rect = largestRect(PHOTO, r);
      const { w, h } = px(rect, PHOTO);
      expect(w / h, `ratio ${r}`).toBeCloseTo(r, 9);
      expectInside(rect);
      expect(Math.max(rect.width, rect.height)).toBeCloseTo(1, 12); // 가장 크게: 한 변은 사진에 닿는다
    }
    expectRectClose(largestRect(PHOTO, 4 / 3), FULL_RECT);
  });
});

describe('회전과 좌표 (REQ-EDIT-014~015, 부록 편집값 모델과 좌표)', () => {
  it('TC-EDIT-017 돌린 사진의 점 (xr, yr) → 원본: 0:(xr,yr), 1:(yr,H−xr), 2:(W−xr,H−yr), 3:(W−yr,xr) (W×H=4000×3000)', () => {
    const p = { x: 100, y: 200 };
    expect(rotatedPointToSource(PHOTO, 0, p)).toEqual({ x: 100, y: 200 });
    expect(rotatedPointToSource(PHOTO, 1, p)).toEqual({ x: 200, y: 2900 });
    expect(rotatedPointToSource(PHOTO, 2, p)).toEqual({ x: 3900, y: 2800 });
    expect(rotatedPointToSource(PHOTO, 3, p)).toEqual({ x: 3800, y: 100 });
  });

  it('돌린 사진의 크기는 홀수 회전에서 가로세로가 바뀐다', () => {
    expect(rotatedSize(PHOTO, 0)).toEqual(PHOTO);
    expect(rotatedSize(PHOTO, 1)).toEqual({ width: 3000, height: 4000 });
    expect(rotatedSize(PHOTO, 2)).toEqual(PHOTO);
    expect(rotatedSize(PHOTO, 3)).toEqual({ width: 3000, height: 4000 });
  });

  it('TC-EDIT-016 4000×3000, quarterTurns=1, 돌린 사진(3000×4000)의 왼쪽 절반 → 원본 중심 (2000, 2250), CropWindow(0.5, 0.75, 0.5, 1), 출력 1500×4000', () => {
    const leftHalf: CropRect = { centerX: 0.25, centerY: 0.5, width: 0.5, height: 1 };
    const region = rectToCropRegion(PHOTO, 1, leftHalf);
    expect(region.centerX).toBeCloseTo(0.5, 12);
    expect(region.centerY).toBeCloseTo(0.75, 12);
    expect(region.width).toBe(0.5);
    expect(region.height).toBe(1);
    const center = cropCenterPx(PHOTO, 1, region);
    expect(center.x).toBeCloseTo(2000, 6);
    expect(center.y).toBeCloseTo(2250, 6);
    expect(cropOutputSize(PHOTO, 1, region)).toEqual({ width: 1500, height: 4000 });
  });

  it('TC-EDIT-016 렌더 계획: 돌린 사진에서 (0,0,1500,4000)을 잘라 1500×4000으로 만든다', () => {
    const plan = planGeometry(PHOTO, { quarterTurns: 1, crop: { centerX: 0.5, centerY: 0.75, width: 0.5, height: 1 } });
    expect(plan.quarterTurns).toBe(1);
    expect(plan.rotatedRect).toEqual({ x: 0, y: 0, width: 1500, height: 4000 });
    expect(plan.output).toEqual({ width: 1500, height: 4000 });
  });

  it('TC-EDIT-017 돌린 기준 영역 ↔ 저장 영역 변환은 어느 회전에서나 왕복해도 같다', () => {
    const rnd = seededRandom(17);
    for (const turns of TURNS) {
      for (let i = 0; i < 20; i += 1) {
        const width = 0.1 + rnd() * 0.9;
        const height = 0.1 + rnd() * 0.9;
        const rect: CropRect = { width, height, centerX: width / 2 + rnd() * (1 - width), centerY: height / 2 + rnd() * (1 - height) };
        const back = cropRegionToRect(PHOTO, turns, rectToCropRegion(PHOTO, turns, rect));
        expect(back.centerX, `turns ${turns}`).toBeCloseTo(rect.centerX, 9);
        expect(back.centerY).toBeCloseTo(rect.centerY, 9);
        expect(back.width).toBeCloseTo(rect.width, 12);
        expect(back.height).toBeCloseTo(rect.height, 12);
      }
    }
  });

  it('TC-EDIT-017 저장 영역의 width/height는 돌린 사진 비율이고 중심만 회전 전 원본 비율이다(전체는 어느 회전이나 전체)', () => {
    for (const turns of TURNS) {
      const region = rectToCropRegion(PHOTO, turns, FULL_RECT);
      expect(region.centerX).toBeCloseTo(0.5, 12);
      expect(region.centerY).toBeCloseTo(0.5, 12);
      expect(region.width).toBe(1);
      expect(region.height).toBe(1);
    }
  });

  it('TC-EDIT-020 큰 사진은 먼저 줄인 뒤 자른다: 4096×3072에서 중앙 25%×25%는 1024×768이다(4000×3000이면 1000×750)', () => {
    const crop = { centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25 };
    expect(cropOutputSize({ width: 4096, height: 3072 }, 0, crop)).toEqual({ width: 1024, height: 768 });
    expect(cropOutputSize(PHOTO, 0, crop)).toEqual({ width: 1000, height: 750 });
    expect(planGeometry(PHOTO, { quarterTurns: 0, crop }).rotatedRect).toEqual({ x: 1500, y: 1125, width: 1000, height: 750 });
  });

  it('자르기가 전체이면 렌더 계획은 돌린 사진 전체다', () => {
    const plan = planGeometry(PHOTO, { quarterTurns: 3, crop: FULL_CROP });
    expect(plan.output).toEqual({ width: 3000, height: 4000 });
    expect(plan.rotatedRect).toEqual({ x: 0, y: 0, width: 3000, height: 4000 });
  });

  it('출력 크기는 각 변 최소 1이다', () => {
    expect(cropOutputSize({ width: 10, height: 10 }, 0, { centerX: 0.5, centerY: 0.5, width: 0.001, height: 0.001 })).toEqual({ width: 1, height: 1 });
  });

  it('TC-EDIT-015 영역을 시계 방향으로 돌리면 (cx, cy, w, h) → (1−cy, cx, h, w)이고 4번이면 처음으로 돌아온다', () => {
    const rect: CropRect = { centerX: 0.25, centerY: 0.5, width: 0.5, height: 1 };
    expectRectClose(rotateRectClockwise(rect), { centerX: 0.5, centerY: 0.25, width: 1, height: 0.5 });
    const odd: CropRect = { centerX: 0.3, centerY: 0.6, width: 0.4, height: 0.5 };
    let turned = odd;
    for (let i = 0; i < 4; i += 1) turned = rotateRectClockwise(turned);
    expect(turned.centerX).toBeCloseTo(odd.centerX, 12);
    expect(turned.centerY).toBeCloseTo(odd.centerY, 12);
    expect(turned.width).toBeCloseTo(odd.width, 12);
    expect(turned.height).toBeCloseTo(odd.height, 12);
  });

  it("TC-EDIT-015 '원본' 비율은 회전하면 새 사진 전체가 되어 가로세로가 뒤바뀐다", () => {
    expectRectClose(rotateCrop(FULL_RECT, 'original', { width: 3000, height: 4000 }), FULL_RECT);
    expect(ratioValue('original', { width: 3000, height: 4000 })).toBeCloseTo(0.75, 12);
  });

  it("TC-EDIT-015 '자유'는 전체이면 전체, 일부이면 사진과 함께 돈다", () => {
    expectRectClose(rotateCrop(FULL_RECT, 'free', { width: 3000, height: 4000 }), FULL_RECT);
    const part: CropRect = { centerX: 0.25, centerY: 0.5, width: 0.5, height: 1 };
    expectRectClose(rotateCrop(part, 'free', { width: 3000, height: 4000 }), rotateRectClockwise(part));
  });

  it('REQ-EDIT-014 고정 비율은 회전 뒤에도 같은 비율로 새 사진에서 다시 가장 크게 맞추고, 두 번 돌리면(비율이 같은 방향의 사진) 처음 영역이다', () => {
    const start = largestRect(PHOTO, 0.8); // 2400×3000
    expect(start.width).toBeCloseTo(0.6, 12);
    const rotated = rotateCrop(start, '4-5', { width: 3000, height: 4000 });
    const { w, h } = px(rotated, { width: 3000, height: 4000 });
    expect(w / h).toBeCloseTo(0.8, 9); // 4:5 그대로
    expect(rotated.width).toBeCloseTo(1, 12);
    expect(rotated.height).toBeCloseTo(0.9375, 12); // 3000 × 1.25 = 3750 / 4000
    const again = rotateCrop(rotated, '4-5', PHOTO);
    expect(again.width).toBeCloseTo(start.width, 12);
    expect(again.height).toBeCloseTo(start.height, 12);
  });
});

describe('프레임 끌기 (REQ-EDIT-013, TC-EDIT-018)', () => {
  const start: CropRect = { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 }; // 돌린 사진(4000×3000)에서 (1000,750)~(3000,2250)

  it('TC-EDIT-018 이동은 크기를 유지하고 사진 밖으로 나가지 않는다', () => {
    const right = dragRect(start, 'move', { x: 1, y: 0 }, PHOTO, null);
    expect(right.centerX).toBeCloseTo(0.75, 12);
    expect(right.centerY).toBeCloseTo(0.5, 12);
    expect(right.width).toBeCloseTo(0.5, 12);
    const upLeft = dragRect(start, 'move', { x: -1, y: -1 }, PHOTO, null);
    expect(upLeft.centerX).toBeCloseTo(0.25, 12);
    expect(upLeft.centerY).toBeCloseTo(0.25, 12);
    const small = dragRect(start, 'move', { x: 0.1, y: -0.05 }, PHOTO, null);
    expect(small.centerX).toBeCloseTo(0.6, 12);
    expect(small.centerY).toBeCloseTo(0.45, 12);
  });

  it('TC-EDIT-018 모서리를 끌어 키우면 반대쪽 모서리가 고정되고 사진 경계에서 멈춘다', () => {
    const grown = dragRect(start, 'bottom-right', { x: 1, y: 1 }, PHOTO, null);
    expectRectClose(grown, { centerX: 0.625, centerY: 0.625, width: 0.75, height: 0.75 });
    const topLeft = dragRect(start, 'top-left', { x: -1, y: -1 }, PHOTO, null);
    expect(topLeft.centerX).toBeCloseTo(0.375, 12);
    expect(topLeft.centerY).toBeCloseTo(0.375, 12);
    expect(topLeft.width).toBeCloseTo(0.75, 12);
    expect(topLeft.height).toBeCloseTo(0.75, 12);
  });

  it('TC-EDIT-018 줄이는 것은 짧은 변이 사진 짧은 변의 0.1배(3000 × 0.1 = 300 px)에서 멈춘다', () => {
    expect(MIN_CROP_FRACTION).toBe(0.1);
    const shrunk = dragRect(start, 'top-left', { x: 1, y: 1 }, PHOTO, null); // 반대쪽(오른쪽 아래 (0.75, 0.75)) 고정
    const { w, h } = px(shrunk, PHOTO);
    expect(w).toBeCloseTo(300, 6);
    expect(h).toBeCloseTo(300, 6);
    expect(shrunk.centerX + shrunk.width / 2).toBeCloseTo(0.75, 12);
    expect(shrunk.centerY + shrunk.height / 2).toBeCloseTo(0.75, 12);
  });

  it('TC-EDIT-018 고정 비율(1:1)에서는 끌어도 비율이 유지되고 사진 안에서 멈춘다', () => {
    const square = largestRect(PHOTO, 1); // 3000×3000, 왼쪽 위 (0.125, 0)
    const grown = dragRect(square, 'bottom-right', { x: 0.5, y: 0.5 }, PHOTO, 1);
    expect(px(grown, PHOTO).w / px(grown, PHOTO).h).toBeCloseTo(1, 9);
    expectInside(grown);
    const shrunk = dragRect(square, 'bottom-right', { x: -1, y: -1 }, PHOTO, 1);
    expect(px(shrunk, PHOTO).w).toBeCloseTo(300, 6);
    expect(px(shrunk, PHOTO).h).toBeCloseTo(300, 6);
  });

  it('TC-EDIT-018 16:9처럼 가로가 긴 고정 비율의 최소 크기는 짧은 변(세로)이 300 px이다', () => {
    const wide = largestRect(PHOTO, 16 / 9);
    const shrunk = dragRect(wide, 'bottom-right', { x: -1, y: -1 }, PHOTO, 16 / 9);
    expect(px(shrunk, PHOTO).h).toBeCloseTo(300, 6);
    expect(px(shrunk, PHOTO).w).toBeCloseTo(300 * (16 / 9), 6);
  });

  it('TC-EDIT-018 어떤 끌기 순서에서도 프레임은 사진 안에 있고 짧은 변이 0.1배 이상이며 고정 비율이 유지된다(무작위 300회)', () => {
    const handles: CropHandle[] = ['move', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const images = [PHOTO, { width: 3000, height: 4000 }, { width: 1000, height: 1000 }];
    for (const ratio of [null, 1, 0.8, 16 / 9, 9 / 16]) {
      const rnd = seededRandom(18 + (ratio ? Math.round(ratio * 100) : 0));
      for (const image of images) {
        let rect: CropRect = ratio ? largestRect(image, ratio) : FULL_RECT;
        const shortPx = Math.min(image.width, image.height);
        for (let i = 0; i < 20; i += 1) {
          const handle = handles[Math.floor(rnd() * handles.length)]!;
          const delta = { x: (rnd() - 0.5) * 2.4, y: (rnd() - 0.5) * 2.4 };
          rect = dragRect(rect, handle, delta, image, ratio);
          const label = `ratio ${ratio} ${image.width}×${image.height} #${i} ${handle} (${delta.x.toFixed(2)}, ${delta.y.toFixed(2)})`;
          expectInside(rect, label);
          const { w, h } = px(rect, image);
          expect(Math.min(w, h), label).toBeGreaterThanOrEqual(shortPx * MIN_CROP_FRACTION - 1e-6);
          if (ratio) expect(w / h, label).toBeCloseTo(ratio, 6);
        }
      }
    }
  });

  it('clampRect는 사진 밖으로 나간 영역을 안으로 옮기고 너무 작은 영역을 최소 크기로 키운다', () => {
    const outside = clampRect({ centerX: 1.2, centerY: -0.3, width: 0.5, height: 0.5 }, PHOTO, null);
    expectInside(outside);
    expect(outside.width).toBeCloseTo(0.5, 12);
    expect(outside.centerX).toBeCloseTo(0.75, 12);
    expect(outside.centerY).toBeCloseTo(0.25, 12);
    const tiny = clampRect({ centerX: 0.5, centerY: 0.5, width: 0.001, height: 0.001 }, PHOTO, null);
    expect(Math.min(px(tiny, PHOTO).w, px(tiny, PHOTO).h)).toBeGreaterThanOrEqual(300 - 1e-6);
    const bigger = clampRect({ centerX: 0.5, centerY: 0.5, width: 3, height: 3 }, PHOTO, null);
    expectInside(bigger);
  });

  it('clampRect는 고정 비율이면 비율을 유지한다', () => {
    const rect = clampRect({ centerX: 0.5, centerY: 0.5, width: 0.9, height: 0.9 }, PHOTO, 1);
    expect(px(rect, PHOTO).w / px(rect, PHOTO).h).toBeCloseTo(1, 9);
    expectInside(rect);
  });
});

describe('화면 좌표 (TC-EDIT-019)', () => {
  it('TC-EDIT-019 fitScale = min(영역 가로/사진 가로, 영역 세로/사진 세로)', () => {
    expect(fitScale({ width: 1000, height: 500 }, PHOTO)).toBeCloseTo(500 / 3000, 12);
    expect(fitScale({ width: 400, height: 900 }, PHOTO)).toBeCloseTo(0.1, 12);
    expect(fitScale({ width: 8000, height: 6000 }, PHOTO)).toBe(2);
  });

  it('TC-EDIT-019 사진 좌표 ↔ 화면 좌표 왕복 오차가 1e-6 이하다', () => {
    const scale = fitScale({ width: 390, height: 600 }, PHOTO);
    const offset = { x: 12.5, y: 40.25 };
    const rnd = seededRandom(19);
    for (let i = 0; i < 100; i += 1) {
      const p = { x: rnd() * PHOTO.width, y: rnd() * PHOTO.height };
      const back = screenToImage(imageToScreen(p, scale, offset), scale, offset);
      expect(Math.abs(back.x - p.x)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(back.y - p.y)).toBeLessThanOrEqual(1e-6);
    }
    expect(imageToScreen({ x: 0, y: 0 }, scale, offset)).toEqual(offset);
  });

  it('TC-EDIT-019 자르기 화면 크기는 사진이 보이는 크기에 손잡이 여백을 양쪽으로 더한 크기다', () => {
    expect(cropViewSize(PHOTO, 0.1, 24)).toEqual({ width: 400 + 48, height: 300 + 48 });
    expect(cropViewSize({ width: 3000, height: 4000 }, 0.125, 0)).toEqual({ width: 375, height: 500 });
  });
});
