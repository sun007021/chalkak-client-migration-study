import { MAX_ZOOM, MIN_ZOOM, clampPan, clampZoomScale, pinchScale, releaseZoom, zoomAroundPoint } from './photoZoom';

const SIZE = { width: 400, height: 300 };

describe('핀치 줌 계산 (REQ-FEED-011, 012)', () => {
  it('TC-FEED-046 배율은 1배~4배다', () => {
    expect(MIN_ZOOM).toBe(1);
    expect(MAX_ZOOM).toBe(4);
  });

  it.each([
    [0.2, 1],
    [1, 1],
    [2.5, 2.5],
    [4, 4],
    [7, 4],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])('TC-FEED-046 clampZoomScale(%f) = %f', (input, expected) => {
    expect(clampZoomScale(input)).toBe(expected);
  });

  it('TC-FEED-046 핀치 배율은 시작 배율 × 두 손가락 거리 비율이고 1~4로 맞춘다', () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 100, 150)).toBe(3);
    expect(pinchScale(1, 100, 900)).toBe(4);
    expect(pinchScale(1, 100, 50)).toBe(1);
    expect(pinchScale(2, 100, 30)).toBe(1);
  });

  it('TC-FEED-046 시작 거리가 0이면 시작 배율을 유지한다', () => {
    expect(pinchScale(1.5, 0, 120)).toBe(1.5);
  });

  it('TC-FEED-046 손을 떼면 1배·원위치로 돌아온다', () => {
    expect(releaseZoom()).toEqual({ scale: 1, translate: { x: 0, y: 0 } });
  });

  it('TC-FEED-047 두 손가락 팬은 확대한 범위 안으로 제한된다: 한 축 최대 (배율-1) × 크기 / 2', () => {
    expect(clampPan({ x: 500, y: -500 }, 2, SIZE)).toEqual({ x: 200, y: -150 });
    expect(clampPan({ x: -500, y: 500 }, 3, SIZE)).toEqual({ x: -400, y: 300 });
    expect(clampPan({ x: 50, y: -20 }, 2, SIZE)).toEqual({ x: 50, y: -20 });
  });

  it('TC-FEED-047 배율 1이면 팬은 항상 원점이다', () => {
    expect(clampPan({ x: 80, y: -40 }, 1, SIZE)).toEqual({ x: 0, y: 0 });
  });

  it('TC-FEED-048 손가락 아래 지점이 움직이지 않는다: 이미지 중심 기준 손가락 위치 p, translate t, 배율 s에서 내용 좌표 (p - t) / s가 같다', () => {
    const focal = { x: 100, y: -60 };
    const from = { scale: 1, translate: { x: 0, y: 0 } };
    const next = zoomAroundPoint({ focal, translate: from.translate, fromScale: 1, toScale: 2, size: SIZE });
    const before = { x: (focal.x - from.translate.x) / 1, y: (focal.y - from.translate.y) / 1 };
    const after = { x: (focal.x - next.x) / 2, y: (focal.y - next.y) / 2 };
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next).toEqual({ x: -100, y: 60 });
  });

  it('TC-FEED-048 이미 팬한 상태에서 더 확대해도 손가락 아래 내용이 고정된다', () => {
    const focal = { x: -50, y: 30 };
    const translate = { x: 40, y: -20 };
    const next = zoomAroundPoint({ focal, translate, fromScale: 2, toScale: 3, size: SIZE });
    expect((focal.x - next.x) / 3).toBeCloseTo((focal.x - translate.x) / 2, 6);
    expect((focal.y - next.y) / 3).toBeCloseTo((focal.y - translate.y) / 2, 6);
  });

  it('TC-FEED-048 계산 결과는 확대된 범위로 제한된다(이미지 밖을 짚어 범위를 넘으면 범위 끝에서 멈춘다)', () => {
    const next = zoomAroundPoint({ focal: { x: 400, y: 300 }, translate: { x: 0, y: 0 }, fromScale: 1, toScale: 1.2, size: SIZE });
    expect(next.x).toBeCloseTo(-40, 6);
    expect(next.y).toBeCloseTo(-30, 6);
  });

  it('TC-FEED-046 4배를 넘기려 해도 4배 기준으로 계산한다', () => {
    const next = zoomAroundPoint({ focal: { x: 100, y: 0 }, translate: { x: 0, y: 0 }, fromScale: 1, toScale: 9, size: SIZE });
    expect(next.x).toBeCloseTo(-300, 6);
    expect(next.y).toBeCloseTo(0, 6);
  });
});
