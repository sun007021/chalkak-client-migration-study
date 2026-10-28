import { identityEdit, type AdjustValues, type AdjustmentLayers } from './PhotoEdit';
import {
  clearedLayers,
  effectiveAdjustValue,
  effectiveAdjustValues,
  withAutoStrength,
  withAutoValues,
  withUserValue,
} from './PhotoAdjustmentLayers';

const base = () => identityEdit().adjustments;
const layers = (
  auto: Partial<AdjustValues>,
  autoStrength: number,
  user: Partial<AdjustValues> = {},
): AdjustmentLayers => ({ auto: { ...base().auto, ...auto }, autoStrength, user });

describe('조정 값의 두 층', () => {
  it('TC-EDIT-030 사용자가 만졌으면 사용자 값, 아니면 자동값 x 강도다', () => {
    const l = layers({ exposure: 0.4, contrast: 0.2 }, 1, { exposure: 0.3 });
    expect(effectiveAdjustValue(l, 'exposure')).toBeCloseTo(0.3);
    expect(effectiveAdjustValue(l, 'contrast')).toBeCloseTo(0.2);
  });

  it('TC-EDIT-030 강도 0.5면 (0.3, 0.1), 자동 보정을 끄면 (0.3, 0)이다', () => {
    const half = withAutoStrength(
      layers({ exposure: 0.4, contrast: 0.2 }, 1, { exposure: 0.3 }),
      0.5,
    );
    expect(effectiveAdjustValue(half, 'exposure')).toBeCloseTo(0.3);
    expect(effectiveAdjustValue(half, 'contrast')).toBeCloseTo(0.1);
    const off = withAutoStrength(half, 0);
    expect(effectiveAdjustValue(off, 'exposure')).toBeCloseTo(0.3);
    expect(effectiveAdjustValue(off, 'contrast')).toBeCloseTo(0);
  });

  it('REQ-EDIT-022 강도를 바꿔도 사용자가 직접 만진 항목은 그대로 남는다', () => {
    const l = withAutoStrength(layers({ exposure: 0.4 }, 1, { exposure: 0.3 }), 0.2);
    expect(l.user).toEqual({ exposure: 0.3 });
  });

  it('effectiveAdjustValues는 일곱 항목 모두의 적용 값을 돌려준다', () => {
    const l = layers({ shadows: 0.45, highlights: -0.5 }, 0.5, { warmth: 0.2 });
    expect(effectiveAdjustValues(l)).toEqual({
      exposure: 0,
      contrast: 0,
      highlights: -0.25,
      shadows: 0.225,
      blackPoint: 0,
      saturation: 0,
      warmth: 0.2,
    });
  });

  it('TC-EDIT-031 자동 보정 몫과 같은 값으로 되돌리면 직접 만진 표시가 지워져 다시 자동을 따른다', () => {
    const touched = layers({ exposure: 0.4 }, 1, { exposure: 0.1 });
    const back = withUserValue(touched, 'exposure', 0.4);
    expect(back.user).not.toHaveProperty('exposure');
    expect(effectiveAdjustValue(withAutoStrength(back, 0.5), 'exposure')).toBeCloseTo(0.2);
  });

  it('TC-EDIT-031 자동 보정이 꺼져 있을 때 0으로 되돌리는 것도 몫(0)과 같아 표시가 지워진다', () => {
    const l = withUserValue(layers({ contrast: 0.2 }, 0, { contrast: 0.3 }), 'contrast', 0);
    expect(l.user).toEqual({});
    expect(effectiveAdjustValue(withAutoStrength(l, 1), 'contrast')).toBeCloseTo(0.2);
  });

  it('TC-EDIT-031 자동 보정을 켜기 전에 만진 항목은 켜도 사용자 값이 유지된다', () => {
    const touched = withUserValue(layers({ contrast: 0.2, exposure: 0.4 }, 0), 'contrast', 0.3);
    const on = withAutoStrength(touched, 1);
    expect(effectiveAdjustValue(on, 'contrast')).toBeCloseTo(0.3);
    expect(effectiveAdjustValue(on, 'exposure')).toBeCloseTo(0.4);
  });

  it('REQ-EDIT-024 초기화는 강도 0, 직접 만진 값 삭제, 분석해 둔 자동 보정값 유지다', () => {
    const l = clearedLayers(layers({ exposure: 0.4 }, 1, { warmth: 0.5 }));
    expect(l.autoStrength).toBe(0);
    expect(l.user).toEqual({});
    expect(l.auto.exposure).toBe(0.4);
  });

  it('withAutoValues는 분석값만 바꾸고 강도·직접 값은 유지한다', () => {
    const l = withAutoValues(layers({ exposure: 0.1 }, 0.5, { warmth: 0.5 }), {
      ...base().auto,
      exposure: 0.4,
    });
    expect(l.auto.exposure).toBe(0.4);
    expect(l.autoStrength).toBe(0.5);
    expect(l.user).toEqual({ warmth: 0.5 });
  });

  it('입력 객체를 바꾸지 않는다(불변)', () => {
    const l = layers({ exposure: 0.4 }, 1, { warmth: 0.5 });
    const snapshot = JSON.stringify(l);
    withUserValue(l, 'exposure', 0.2);
    withAutoStrength(l, 0);
    clearedLayers(l);
    expect(JSON.stringify(l)).toBe(snapshot);
  });
});
