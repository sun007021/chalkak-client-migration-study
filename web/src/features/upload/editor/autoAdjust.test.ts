import { NO_AUTO_VALUES } from '../editModel';
import { AUTO_ANALYSIS_LONG_EDGE, analysisSize, analyzePixels, autoAdjustFromStats, computeAutoValues, isSkinColor, luminanceHistogram } from './autoAdjust';
import { editConstants } from './editConstants';
import { flatHistogram, grayRamp, histogramOf, pixelsOf, solid } from '../../../test/pixels';
import type { Rgba } from '../../../test/pixels';

/** 허용 오차 이내인가(부동소수 경계를 피하려고 한 칸의 반만큼 여유). */
const near = (actual: number, expected: number, tolerance = 0.0100001) => Math.abs(actual - expected) <= tolerance;
const expectValues = (actual: Record<string, number>, expected: Record<string, number>) => {
  for (const [key, value] of Object.entries(expected)) expect(near(actual[key]!, value, 0.0050001), `${key}: ${actual[key]} (기대 ${value})`).toBe(true);
};

describe('자동 보정 분석 표본 (REQ-EDIT-025)', () => {
  it('TC-EDIT-036 분석 표본의 긴 변은 256이고 확대하지 않는다', () => {
    expect(AUTO_ANALYSIS_LONG_EDGE).toBe(256);
    expect(analysisSize({ width: 4000, height: 3000 })).toEqual({ width: 256, height: 192 });
    expect(analysisSize({ width: 3000, height: 4000 })).toEqual({ width: 192, height: 256 });
    expect(analysisSize({ width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
    expect(analysisSize({ width: 10000, height: 10 })).toEqual({ width: 256, height: 1 });
  });
});

describe('밝기 히스토그램과 피부색 (부록 자동 보정 상수)', () => {
  it('REQ-EDIT-026 밝기 칸 번호는 min(255, round(L × 255)), L = 0.2126R + 0.7152G + 0.0722B(저장 값 기준)이다', () => {
    const h = luminanceHistogram(
      pixelsOf([
        [255, 255, 255, 255],
        [0, 0, 0, 255],
        [128, 128, 128, 255],
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        [0, 0, 255, 255],
      ]),
    );
    expect(h.length).toBe(256);
    // 빨강 0.2126·255 = 54.2 → 54, 초록 0.7152·255 = 182.4 → 182, 파랑 0.0722·255 = 18.4 → 18
    for (const bin of [255, 0, 128, 54, 182, 18]) expect(h[bin], `칸 ${bin}`).toBe(1);
    expect(Array.from(h).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it('TC-EDIT-034 피부색 판정: R ≥ G ≥ B, R ≥ 0.2, (R−B)/R가 0.1~0.6, 색상 0~50°를 모두 만족해야 한다', () => {
    expect(isSkinColor(240, 199, 176)).toBe(true); // 밝은 피부 (0.94, 0.78, 0.69)
    expect(isSkinColor(115, 77, 56)).toBe(true); // 어두운 피부 (0.45, 0.30, 0.22)
    expect(isSkinColor(230, 150, 130)).toBe(true);
    expect(isSkinColor(200, 100, 100)).toBe(true); // 색상 0°
    expect(isSkinColor(200, 180, 100)).toBe(true); // 색상 48°
    expect(isSkinColor(135, 207, 235)).toBe(false); // 하늘: R < G
    expect(isSkinColor(77, 153, 51)).toBe(false); // 풀: R < G
    expect(isSkinColor(255, 0, 0)).toBe(false); // (R−B)/R = 1 > 0.6
    expect(isSkinColor(128, 128, 128)).toBe(false); // (R−B)/R = 0 < 0.1
    expect(isSkinColor(30, 20, 10)).toBe(false); // R < 0.2
    expect(isSkinColor(200, 200, 100)).toBe(false); // 색상 60° > 50°
  });

  it('TC-EDIT-034 통계는 채도(가장 큰 채널 − 가장 작은 채널)의 하위 90% 지점과 피부색 비율을 모은다', () => {
    const sky: Rgba = [135, 207, 235, 255];
    const skin: Rgba = [230, 150, 130, 255]; // 채도 100/255로 하늘과 같다
    const stats = analyzePixels(pixelsOf([sky, sky, sky, skin]));
    expect(stats.saturationP90).toBeCloseTo(100 / 255, 6);
    expect(stats.skinRatio).toBeCloseTo(0.25, 12);
    expect(Array.from(stats.histogram).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('TC-EDIT-035 임의 색의 채도 세기는 색상과 무관하게 같은 기준(가장 큰 채널 − 가장 작은 채널)으로 센다', () => {
    // 모두 최대−최소 = 100: 빨강·초록·파랑·청록·자홍 계열
    const colors: Rgba[] = [
      [200, 100, 100, 255],
      [100, 200, 100, 255],
      [100, 100, 200, 255],
      [100, 200, 200, 255],
      [200, 100, 200, 255],
    ];
    for (const color of colors) expect(analyzePixels(solid(2, 2, color)).saturationP90, JSON.stringify(color)).toBeCloseTo(100 / 255, 6);
  });
});

describe('자동 보정값 식 (REQ-EDIT-026, 부록 자동 보정 식)', () => {
  // 기대값은 부록 식을 순서대로 손으로 계산한 값이다(참조 계산: P(f) → 노출 → 블랙 포인트 → afterBlack → 그림자·하이라이트·대비 → 채도).
  // 예) 칸 120~180에 한 개씩(61개): white = P(0.995) = 180/255 = 0.706 < 0.96 → ev = log2(linear(0.96)/linear(0.706)) × 0.6 = log2(2.003) × 0.6 = 0.6 → 노출 = round2(0.6/1.5) = 0.40

  it('TC-EDIT-033 대비가 낮고 뜬 사진(칸 120~180)은 노출 0.40, 블랙 포인트 0.83, 대비 0.40을 올리고 그림자·하이라이트는 0이다', () => {
    const v = autoAdjustFromStats({ histogram: flatHistogram(120, 180), saturationP90: 0.3, skinRatio: 0 });
    expectValues(v, { exposure: 0.4, blackPoint: 0.83, shadows: 0, highlights: 0, contrast: 0.4, saturation: 0.24, warmth: 0 });
  });

  it('TC-EDIT-033 밝기가 고른 사진(칸 0~255 한 개씩)은 노출·블랙 포인트·대비 0이고 그림자 0.20, 하이라이트 -0.31만 조금 바꾼다', () => {
    const v = autoAdjustFromStats({ histogram: flatHistogram(0, 255), saturationP90: 0.3, skinRatio: 0 });
    expectValues(v, { exposure: 0, blackPoint: 0, shadows: 0.2, highlights: -0.31, contrast: 0, warmth: 0 });
  });

  it('REQ-EDIT-026 어두운 사진(칸 20~80)은 노출 0.67, 블랙 포인트 0.30, 그림자 0.38, 대비 0.40을 올린다', () => {
    const v = autoAdjustFromStats({ histogram: flatHistogram(20, 80), saturationP90: 0.3, skinRatio: 0 });
    expectValues(v, { exposure: 0.67, blackPoint: 0.3, shadows: 0.38, highlights: 0, contrast: 0.4 });
  });

  it('REQ-EDIT-026 밝은 사진(칸 200~255)은 노출 -0.22, 블랙 포인트 0.83, 하이라이트 -0.21, 대비 0.40이다', () => {
    const v = autoAdjustFromStats({ histogram: flatHistogram(200, 255), saturationP90: 0.3, skinRatio: 0 });
    expectValues(v, { exposure: -0.22, blackPoint: 0.83, shadows: 0, highlights: -0.21, contrast: 0.4 });
  });

  it('REQ-EDIT-026 노출은 -0.5~1.0EV(값으로는 -0.33~0.67)로 자르고, 따뜻함은 정하지 않는다(항상 0)', () => {
    const veryDark = autoAdjustFromStats({ histogram: histogramOf([[2, 100]]), saturationP90: 0.3, skinRatio: 0 });
    expect(veryDark.exposure).toBeCloseTo(0.67, 2); // 1.0EV / 1.5
    expect(veryDark.warmth).toBe(0);
    const veryBright = autoAdjustFromStats({ histogram: histogramOf([[255, 100]]), saturationP90: 0.3, skinRatio: 0 });
    expect(veryBright.exposure).toBeGreaterThanOrEqual(-0.34); // -0.5EV / 1.5 = -0.33
    expect(veryBright.exposure).toBeLessThan(0);
  });

  it('TC-EDIT-033 흑백 사진은 채도를 올리지 않는다(채도 통계 0.05 이하이면 0)', () => {
    const v = autoAdjustFromStats({ histogram: flatHistogram(120, 180), saturationP90: 0.05, skinRatio: 0 });
    expect(v.saturation).toBe(0);
    expect(computeAutoValues(grayRamp()).saturation).toBe(0);
  });

  it('TC-EDIT-034 채도 = round2(clamp((0.7 − s) × 0.6, 0, 0.25) × (1 − 피부색 비율)): s=0.392 → 0.18, 피부 1/4이면 0.14, 전부 피부면 0', () => {
    const base = { histogram: flatHistogram(120, 180) };
    expect(near(autoAdjustFromStats({ ...base, saturationP90: 100 / 255, skinRatio: 0 }).saturation, 0.18, 0.0050001)).toBe(true);
    expect(near(autoAdjustFromStats({ ...base, saturationP90: 100 / 255, skinRatio: 0.25 }).saturation, 0.14, 0.0050001)).toBe(true);
    expect(autoAdjustFromStats({ ...base, saturationP90: 100 / 255, skinRatio: 1 }).saturation).toBe(0);
    // 채도가 이미 높으면(s ≥ 0.7 − 0) 올리지 않는다
    expect(autoAdjustFromStats({ ...base, saturationP90: 0.9, skinRatio: 0 }).saturation).toBe(0);
    // 상한 0.25
    expect(near(autoAdjustFromStats({ ...base, saturationP90: 0.06, skinRatio: 0 }).saturation, 0.25, 0.0050001)).toBe(true);
  });

  it('REQ-EDIT-027 분석할 픽셀이 없으면(빈 히스토그램) 자동 보정은 아무것도 바꾸지 않는다', () => {
    expect(autoAdjustFromStats({ histogram: new Uint32Array(256), saturationP90: 0, skinRatio: 0 })).toEqual(NO_AUTO_VALUES);
    expect(computeAutoValues(new Uint8ClampedArray(0))).toEqual(NO_AUTO_VALUES);
  });

  it('TC-EDIT-033 같은 밝기 분포의 실제 픽셀(회색 120~180)에서 computeAutoValues는 같은 값을 낸다', () => {
    const colors = Array.from({ length: 61 }, (_, i) => [120 + i, 120 + i, 120 + i, 255] as const);
    const v = computeAutoValues(pixelsOf(colors));
    expectValues(v, { exposure: 0.4, blackPoint: 0.83, shadows: 0, highlights: 0, contrast: 0.4, saturation: 0, warmth: 0 });
  });

  it('TC-EDIT-034 단색 사진: 밝은 피부 (0.94,0.78,0.69), 어두운 피부 (0.45,0.30,0.22)는 자동 채도 0, 하늘 (0.53,0.81,0.92)은 +19, 풀 (0.30,0.60,0.20)은 +18 (±1)이다', () => {
    // 바이트로는 밝은 피부 (240,199,176), 어두운 피부 (115,77,56), 하늘 (135,207,235), 풀 (77,153,51).
    // 채도 통계: 64/255, 59/255, 100/255, 102/255 → 하늘 (0.7−0.392)×0.6 = 0.185, 풀 (0.7−0.4)×0.6 = 0.18. 피부색은 비율 1이라 0.
    const cases: [Rgba, number][] = [
      [[240, 199, 176, 255], 0],
      [[115, 77, 56, 255], 0],
      [[135, 207, 235, 255], 0.19],
      [[77, 153, 51, 255], 0.18],
    ];
    for (const [color, expected] of cases) expect(near(computeAutoValues(solid(8, 8, color)).saturation, expected), JSON.stringify(color)).toBe(true);
  });

  it('TC-EDIT-034 일부(1/4)만 피부색이면 올릴 양의 3/4만 올린다', () => {
    const sky: Rgba = [135, 207, 235, 255];
    const skin: Rgba = [230, 150, 130, 255]; // 채도가 하늘과 같아 통계가 섞이지 않는다
    const full = computeAutoValues(solid(4, 4, sky)).saturation; // 0.18
    const quarter = computeAutoValues(pixelsOf([sky, sky, sky, skin])).saturation; // 0.18 × 0.75 = 0.135 → 0.14
    expect(near(quarter, full * 0.75, 0.0100001)).toBe(true);
    expect(near(quarter, 0.14, 0.0050001)).toBe(true);
  });
});

describe('자동 보정 상수 (TC-EDIT-036)', () => {
  it('TC-EDIT-036 상수가 부록과 같다: 표본 256, 노출 -0.5~1.0EV·1.5EV/단위, 흰색 목표 0.96, 블랙 포인트 0.3, 따뜻함 0.25, 톤 0.25, 대비 0.6', () => {
    // shared/photo-edit/filters.json이 없어 부록 표가 근거다.
    const c = editConstants();
    expect(c.exposureEvPerUnit).toBe(1.5);
    expect(c.warmthGain).toBe(0.25);
    expect(c.blackPointRange).toBe(0.3);
    expect(c.toneAmount).toBe(0.25);
    expect(c.contrastAmount).toBe(0.6);
    expect(c.saturationLuma).toEqual([0.2125, 0.7154, 0.0721]);
    expect(c.autoLuma).toEqual([0.2126, 0.7152, 0.0722]);
    expect(c.auto).toMatchObject({
      analysisLongEdge: 256,
      exposureMinEv: -0.5,
      exposureMaxEv: 1.0,
      whitePercentile: 0.995,
      whiteTarget: 0.96,
      whiteMin: 0.05,
      exposureTempering: 0.6,
      brightMedian: 0.62,
      brightSlope: 1.2,
      blackPercentile: 0.005,
      blackMargin: 0.01,
      blackTempering: 0.8,
      blackMax: 0.25,
      shadowDark: 0.25,
      shadowFull: 0.8,
      shadowMax: 0.45,
      highlightBright: 0.85,
      highlightFull: 0.3,
      highlightMax: -0.5,
      toneResponseExponent: 0.7,
      contrastLowQuantile: 0.25,
      contrastHighQuantile: 0.75,
      contrastTargetSpread: 0.42,
      contrastSlope: 2.0,
      contrastMax: 0.4,
      saturationMonoLimit: 0.05,
      saturationTarget: 0.7,
      saturationSlope: 0.6,
      saturationMax: 0.25,
      saturationPercentile: 0.9,
    });
  });

  it('TC-EDIT-036 자동 보정을 정하는 순서는 노출 → 블랙 포인트 → 그림자·하이라이트·대비 → 채도다', () => {
    expect([...editConstants().auto.order]).toEqual(['exposure', 'blackPoint', 'shadows-highlights-contrast', 'saturation']);
  });
});
