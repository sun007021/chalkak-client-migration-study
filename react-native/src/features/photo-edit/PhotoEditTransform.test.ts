import {
  limitLongEdge,
  resolveCrop,
  rotatedPointToOriginal,
  rotatedSize,
} from './PhotoEditTransform';
import type { QuarterTurns } from './PhotoEdit';

const SOURCE = { width: 4000, height: 3000 };

describe('회전·자르기 변환', () => {
  it('TC-EDIT-017 돌린 사진의 점을 원본 점으로 바꾼다(0:(xr,yr), 1:(yr,H-xr), 2:(W-xr,H-yr), 3:(W-yr,xr))', () => {
    const point = { x: 100, y: 200 };
    expect(rotatedPointToOriginal(point, 0, SOURCE)).toEqual({ x: 100, y: 200 });
    expect(rotatedPointToOriginal(point, 1, SOURCE)).toEqual({ x: 200, y: 2900 });
    expect(rotatedPointToOriginal(point, 2, SOURCE)).toEqual({ x: 3900, y: 2800 });
    expect(rotatedPointToOriginal(point, 3, SOURCE)).toEqual({ x: 3800, y: 100 });
  });

  it.each([
    [0, { width: 4000, height: 3000 }],
    [1, { width: 3000, height: 4000 }],
    [2, { width: 4000, height: 3000 }],
    [3, { width: 3000, height: 4000 }],
  ] as [QuarterTurns, { width: number; height: number }][])(
    'REQ-EDIT-014 회전 %i번이면 돌린 사진의 크기는 %j다',
    (turns, expected) => {
      expect(rotatedSize(SOURCE, turns)).toEqual(expected);
    },
  );

  it('TC-EDIT-016 4000x3000, quarterTurns=1, 돌린 사진(3000x4000)의 왼쪽 절반이면 원본 중심 (2000, 2250), 출력 1500x4000이다', () => {
    const resolved = resolveCrop({
      source: SOURCE,
      quarterTurns: 1,
      crop: { centerX: 0.5, centerY: 0.75, width: 0.5, height: 1 },
    });
    expect(resolved.centerX).toBeCloseTo(2000);
    expect(resolved.centerY).toBeCloseTo(2250);
    expect(resolved.outputWidth).toBeCloseTo(1500);
    expect(resolved.outputHeight).toBeCloseTo(4000);
  });

  it('REQ-EDIT-002 전체 자르기는 원본 중심, 돌린 크기 그대로다', () => {
    const resolved = resolveCrop({
      source: SOURCE,
      quarterTurns: 0,
      crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 },
    });
    expect(resolved).toEqual({
      centerX: 2000,
      centerY: 1500,
      outputWidth: 4000,
      outputHeight: 3000,
    });
  });

  it('TC-EDIT-020 8000x6000 중앙 25% 자르기는 4096 이하로 줄인 뒤 자르므로 출력이 약 1000x750(+-5%)이다', () => {
    const reduced = limitLongEdge({ width: 8000, height: 6000 }, 4096);
    const resolved = resolveCrop({
      source: reduced,
      quarterTurns: 0,
      crop: { centerX: 0.5, centerY: 0.5, width: 0.25, height: 0.25 },
    });
    expect(resolved.outputWidth).toBeGreaterThan(1000 * 0.95);
    expect(resolved.outputWidth).toBeLessThan(1000 * 1.05 + 30);
    expect(resolved.outputHeight).toBeGreaterThan(750 * 0.95);
    expect(resolved.outputHeight).toBeLessThan(750 * 1.05 + 30);
  });
});

describe('limitLongEdge', () => {
  it('TC-UPL-034 8000x6000은 긴 변 4096 이하로 줄고 가로세로 비율 오차가 1px 이내다', () => {
    const out = limitLongEdge({ width: 8000, height: 6000 }, 4096);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(4096);
    expect(Math.abs(out.height - (out.width * 6000) / 8000)).toBeLessThanOrEqual(1);
  });

  it('TC-UPL-034 4096x3072는 그대로, 4097x3000은 긴 변이 4096 이하다(확대하지 않는다)', () => {
    expect(limitLongEdge({ width: 4096, height: 3072 }, 4096)).toEqual({
      width: 4096,
      height: 3072,
    });
    const out = limitLongEdge({ width: 4097, height: 3000 }, 4096);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(4096);
    expect(Math.abs(out.height - (out.width * 3000) / 4097)).toBeLessThanOrEqual(1);
  });

  it('REQ-UPL-027 작은 사진은 어떤 경우에도 확대하지 않는다', () => {
    expect(limitLongEdge({ width: 1600, height: 1200 }, 4096)).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(limitLongEdge({ width: 100, height: 50 }, 4096)).toEqual({ width: 100, height: 50 });
  });

  it('세로로 긴 사진도 긴 변(높이)을 기준으로 줄인다', () => {
    const out = limitLongEdge({ width: 3000, height: 8000 }, 4096);
    expect(out.height).toBeLessThanOrEqual(4096);
    expect(out.width).toBeLessThan(out.height);
  });
});
