import { analyzeAutoAdjust } from './PhotoAutoAdjuster';
import { grayRamp, solidImage } from './__testing__/createEditHarness';
import type { RgbaImage } from './ImageTypes';

const byte = (v: number) => Math.round(v * 255);
const solid = (r: number, g: number, b: number) =>
  solidImage(8, 8, [byte(r), byte(g), byte(b), 255]);
/** 표시 값은 소수 둘째 자리를 100배한 정수라, +-1(0.01) 오차를 허용한다. */
const near = (actual: number, expected: number, tolerance = 0.0101) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

describe('자동 보정 분석', () => {
  it('TC-EDIT-034 단색 사진의 자동 채도: 밝은 피부 0, 어두운 피부 0, 하늘 +19, 풀 +18 (+-1)', () => {
    near(analyzeAutoAdjust(solid(0.94, 0.78, 0.69)).saturation, 0);
    near(analyzeAutoAdjust(solid(0.45, 0.3, 0.22)).saturation, 0);
    near(analyzeAutoAdjust(solid(0.53, 0.81, 0.92)).saturation, 0.19);
    near(analyzeAutoAdjust(solid(0.3, 0.6, 0.2)).saturation, 0.18);
  });

  it('TC-EDIT-034 일부(1/4)만 피부색이면 올릴 양의 3/4만 올린다', () => {
    const sky = byte(0.53);
    const full = analyzeAutoAdjust(solid(0.53, 0.81, 0.92)).saturation;
    const mixed: RgbaImage = solidImage(8, 8, [sky, byte(0.81), byte(0.92), 255]);
    // 아래 16칸(1/4)을 밝은 피부색으로 바꾼다.
    for (let i = 48; i < 64; i += 1)
      mixed.data.set([byte(0.94), byte(0.78), byte(0.69), 255], i * 4);
    near(analyzeAutoAdjust(mixed).saturation, full * 0.75, 0.0151);
  });

  it('TC-EDIT-035 채도 세기는 색상과 무관하게 같은 기준으로 센다(같은 max-min이면 같은 값)', () => {
    const red = analyzeAutoAdjust(solid(0.8, 0.4, 0.4)).saturation;
    const green = analyzeAutoAdjust(solid(0.4, 0.8, 0.4)).saturation;
    const blue = analyzeAutoAdjust(solid(0.4, 0.4, 0.8)).saturation;
    near(green, blue, 0.0101);
    expect(green).toBeGreaterThan(0);
    // 빨강은 피부색 판정 영역(색상 0~50도)이라 올릴 양이 줄 수 있어 초록·파랑과 비교하지 않는다.
    expect(red).toBeLessThanOrEqual(green);
  });

  it('TC-EDIT-033 대비가 낮고 뜬 사진은 블랙 포인트·대비·노출을 올려 밝기 범위를 넓힌다', () => {
    const values = analyzeAutoAdjust(grayRamp(64, 4, 140, 200));
    expect(values.blackPoint).toBeGreaterThan(0);
    expect(values.contrast).toBeGreaterThan(0);
    expect(values.exposure).toBeGreaterThan(0);
  });

  it('TC-EDIT-033 밝기가 고른 사진은 여러 항목을 조금씩만 정한다(노출·블랙 포인트·대비는 0)', () => {
    const values = analyzeAutoAdjust(grayRamp(256, 2, 0, 255));
    expect(values.exposure).toBeCloseTo(0, 10);
    expect(values.blackPoint).toBeCloseTo(0, 10);
    expect(values.contrast).toBeCloseTo(0, 10);
    expect(values.shadows).toBeGreaterThan(0);
    expect(values.highlights).toBeLessThan(0);
    for (const v of Object.values(values)) expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
  });

  it('TC-EDIT-033 흑백 사진은 채도를 올리지 않는다', () => {
    expect(analyzeAutoAdjust(grayRamp(64, 4, 20, 230)).saturation).toBeCloseTo(0, 10);
  });

  it('REQ-EDIT-026 따뜻함은 정하지 않고 모든 값은 소수 둘째 자리이며 범위를 지킨다', () => {
    const values = analyzeAutoAdjust(grayRamp(64, 4, 140, 200));
    expect(values.warmth).toBeCloseTo(0, 10);
    for (const v of Object.values(values)) {
      expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(values.exposure).toBeGreaterThanOrEqual(-0.5 / 1.5 - 1e-9);
    expect(values.exposure).toBeLessThanOrEqual(1 / 1.5 + 1e-9);
  });
});
