import { clampPan, clampScale, MAX_ZOOM, MIN_ZOOM, panForFocalPoint } from './photoZoom';

const CONTAINER = { width: 400, height: 600 };
const center = { x: 200, y: 300 };

/** 컨텐츠 점 p의 화면 위치(변환: 중심 기준 translate(pan) -> scale). */
const screenOf = (p: { x: number; y: number }, scale: number, pan: { x: number; y: number }) => ({
  x: center.x + pan.x + scale * (p.x - center.x),
  y: center.y + pan.y + scale * (p.y - center.y),
});

describe('핀치 줌', () => {
  it('TC-FEED-046 배율은 1x~4x로 clamp되고 손을 떼면 1x로 돌아온다', () => {
    expect([MIN_ZOOM, MAX_ZOOM]).toEqual([1, 4]);
    expect(clampScale(0.4)).toBe(1);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(9)).toBe(4);
  });

  it('TC-FEED-047 두 손가락 팬은 확대된 이미지 범위 안으로 제한된다', () => {
    expect(clampPan({ x: 500, y: -900 }, 2, CONTAINER)).toEqual({ x: 200, y: -300 });
    expect(clampPan({ x: 50, y: 20 }, 2, CONTAINER)).toEqual({ x: 50, y: 20 });
    expect(clampPan({ x: 50, y: 20 }, 1, CONTAINER)).toEqual({ x: 0, y: 0 });
  });

  it('TC-FEED-048 손가락 아래 지점이 확대 전후 같은 화면 위치에 있다', () => {
    const focal = { x: 300, y: 400 };
    const pan = panForFocalPoint(focal, 1, 2, { x: 0, y: 0 }, CONTAINER);
    expect(pan).toEqual({ x: -100, y: -100 });
    // 확대 중 다시 확대: 기존 pan이 있어도 불변이어야 한다.
    const from = { x: 30, y: -20 };
    const p = {
      x: center.x + (focal.x - center.x - from.x) / 1.5,
      y: center.y + (focal.y - center.y - from.y) / 1.5,
    };
    const next = panForFocalPoint(focal, 1.5, 3, from, CONTAINER);
    const before = screenOf(p, 1.5, from);
    const after = screenOf(p, 3, next);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});
