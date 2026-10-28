import { fitLongEdge, roundSizes } from './imageSizing';

describe('fitLongEdge (REQ-UPL-027, TC-UPL-034 크기 계산)', () => {
  it.each([
    [{ width: 8000, height: 6000 }, { width: 4096, height: 3072 }],
    [{ width: 4608, height: 3456 }, { width: 4096, height: 3072 }],
    [{ width: 3000, height: 8000 }, { width: 1536, height: 4096 }],
    [{ width: 5000, height: 5000 }, { width: 4096, height: 4096 }],
    [{ width: 4097, height: 3000 }, { width: 4096, height: 2999 }],
  ])('TC-UPL-034 긴 변이 4096을 넘으면 비율을 유지해 4096으로 줄인다: %j', (input, expected) => {
    expect(fitLongEdge(input)).toEqual(expected);
  });

  it.each([
    [{ width: 4096, height: 3072 }],
    [{ width: 4096, height: 4096 }],
    [{ width: 1600, height: 1200 }],
    [{ width: 1, height: 1 }],
  ])('TC-UPL-034 4096 이하는 그대로이고 어떤 경우에도 확대하지 않는다: %j', (input) => {
    expect(fitLongEdge(input)).toEqual(input);
  });

  it('TC-UPL-034 가로세로 비율 오차는 1px 이내이고 각 변은 최소 1이다', () => {
    const out = fitLongEdge({ width: 8000, height: 6000 });
    expect(Math.abs(out.width / out.height - 8000 / 6000) * out.height).toBeLessThanOrEqual(1);
    expect(fitLongEdge({ width: 10000, height: 1 })).toEqual({ width: 4096, height: 1 });
  });

  it('TC-UPL-034 상한 인수를 줄 수 있다', () => {
    expect(fitLongEdge({ width: 1000, height: 500 }, 800)).toEqual({ width: 800, height: 400 });
    expect(fitLongEdge({ width: 600, height: 500 }, 800)).toEqual({ width: 600, height: 500 });
  });
});

describe('roundSizes (REQ-UPL-031, TC-UPL-038)', () => {
  it('TC-UPL-038 기본은 4라운드: 원본 크기와 0.85, 0.85², 0.85³배를 각 변마다 반올림한다', () => {
    expect(roundSizes({ width: 1600, height: 1200 })).toEqual([
      { width: 1600, height: 1200 },
      { width: 1360, height: 1020 },
      { width: 1156, height: 867 },
      { width: 983, height: 737 },
    ]);
    expect(roundSizes({ width: 100, height: 100 })).toEqual([
      { width: 100, height: 100 },
      { width: 85, height: 85 },
      { width: 72, height: 72 },
      { width: 61, height: 61 },
    ]);
  });

  it('TC-UPL-038 축소 횟수와 비율을 바꿀 수 있고 길이는 축소 횟수 + 1이다', () => {
    expect(roundSizes({ width: 1000, height: 1000 }, 0)).toEqual([{ width: 1000, height: 1000 }]);
    expect(roundSizes({ width: 1000, height: 1000 }, 1, 0.5)).toEqual([
      { width: 1000, height: 1000 },
      { width: 500, height: 500 },
    ]);
  });

  it('TC-UPL-038 각 변은 최소 1이다', () => {
    const sizes = roundSizes({ width: 1000, height: 1 });
    expect(sizes.every((s) => s.height === 1 && s.width >= 1)).toBe(true);
    expect(sizes[0]).toEqual({ width: 1000, height: 1 });
  });
});
