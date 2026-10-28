import { PinchTracker } from './pinchTracker';

const CONTAINER = { width: 400, height: 600 };
const touch = (x: number, y: number) => ({ pageX: x, pageY: y });
const IDENTITY = { scale: 1, pan: { x: 0, y: 0 } };

/** 컨테이너가 화면에서 (0, 100)에 있다고 가정하고 같은 핀치를 다른 순서로 측정을 도착시켜 비교한다. */
function pinch(measure: 'before' | 'after-start') {
  const tracker = new PinchTracker();
  tracker.setContainer(CONTAINER);
  if (measure === 'before') tracker.originMeasured({ x: 0, y: 100 });
  tracker.start(touch(150, 450), touch(250, 450), IDENTITY);
  if (measure === 'after-start') tracker.originMeasured({ x: 0, y: 100 });
  return tracker.move(touch(100, 450), touch(300, 450));
}

describe('PinchTracker 핀치 계산', () => {
  it('두 손가락 간격에 비례해 1~4배로 확대한다', () => {
    const tracker = new PinchTracker();
    tracker.setContainer(CONTAINER);
    tracker.start(touch(150, 300), touch(250, 300), IDENTITY);
    expect(tracker.move(touch(100, 300), touch(300, 300))?.scale).toBe(2);
    expect(tracker.move(touch(0, 300), touch(900, 300))?.scale).toBe(4);
  });

  it('첫 핀치: origin 측정이 터치 시작보다 늦게 도착해도(아직 그리기 전) 미리 잰 것과 같은 결과다', () => {
    expect(pinch('after-start')).toEqual(pinch('before'));
  });

  it('이미 그리기 시작한 제스처 도중 도착한 origin은 다음 제스처로 미뤄 화면이 튀지 않는다', () => {
    const tracker = new PinchTracker();
    tracker.setContainer(CONTAINER);
    tracker.originMeasured({ x: 0, y: 100 });
    tracker.start(touch(150, 450), touch(250, 450), IDENTITY);
    const first = tracker.move(touch(100, 450), touch(300, 450));
    tracker.originMeasured({ x: 0, y: 160 });
    expect(tracker.move(touch(100, 450), touch(300, 450))).toEqual(first);
    tracker.end();
    // 다음 제스처부터 새 origin이다.
    tracker.start(touch(150, 450), touch(250, 450), IDENTITY);
    expect(tracker.move(touch(100, 450), touch(300, 450))).not.toEqual(first);
  });

  it('복귀 애니메이션 도중 시작한 새 핀치는 화면에 보이는 중간 배율에서 이어진다', () => {
    const tracker = new PinchTracker();
    tracker.setContainer(CONTAINER);
    tracker.start(touch(150, 300), touch(250, 300), { scale: 1.5, pan: { x: 0, y: 0 } });
    expect(tracker.move(touch(150, 300), touch(250, 300))?.scale).toBe(1.5);
    expect(tracker.move(touch(100, 300), touch(300, 300))?.scale).toBe(3);
  });

  it('제스처가 없으면 move는 null이다', () => {
    const tracker = new PinchTracker();
    expect(tracker.move(touch(0, 0), touch(1, 1))).toBeNull();
    expect(tracker.active).toBe(false);
  });
});
