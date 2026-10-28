import { strokeToSvgPath } from './SignatureStrokePath';

describe('strokeToSvgPath', () => {
  it('점 하나는 null(원으로 그린다)이다', () => {
    expect(strokeToSvgPath([{ x: 1, y: 2 }])).toBeNull();
  });

  it('두 점은 직선이다', () => {
    expect(
      strokeToSvgPath([
        { x: 0, y: 0 },
        { x: 10, y: 20 },
      ]),
    ).toBe('M0 0 L10 20');
  });

  it('세 점 이상은 중간점을 제어점으로 하는 이차 곡선으로 잇고 마지막 점까지 직선이다', () => {
    expect(
      strokeToSvgPath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 40, y: 0 },
      ]),
    ).toBe('M0 0 Q10 10 20 10 Q30 10 35 5 L40 0');
  });
});
