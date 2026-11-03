import { toDisplayValue } from './adjustments';

describe('코드 리뷰 12: 표시값 반올림은 0에서 먼 쪽으로 대칭이다', () => {
  it('REQ-EDIT-019 0.125 → 13, -0.125 → -13 (양수와 음수가 같은 크기)', () => {
    expect(toDisplayValue(0.125)).toBe(13);
    expect(toDisplayValue(-0.125)).toBe(-13);
    expect(toDisplayValue(0.455)).toBe(-toDisplayValue(-0.455));
    expect(toDisplayValue(-0.004)).toBe(0);
    expect(Object.is(toDisplayValue(-0.004), 0)).toBe(true);
  });
});
