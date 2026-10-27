import { AppState, type AppStateStatus } from 'react-native';

import { ReactNativeAppVisibility } from './ReactNativeAppVisibility';

type Handler = (status: AppStateStatus) => void;

function setup(initial: AppStateStatus = 'active') {
  let handler: Handler | null = null;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: Handler) => {
    handler = h;
    return { remove };
  }) as never);
  // jest 목에서는 currentState가 jest.fn이라 replaceProperty/spyOn이 거부한다. 값을 직접 넣고 afterEach에서 되돌린다.
  (AppState as unknown as { currentState: unknown }).currentState = initial;
  const visibility = new ReactNativeAppVisibility();
  const received: string[] = [];
  const stop = visibility.subscribe((s) => received.push(s));
  return { visibility, received, stop, remove, emit: (s: AppStateStatus) => handler?.(s) };
}

const originalState = AppState.currentState;
afterEach(() => {
  jest.restoreAllMocks();
  (AppState as unknown as { currentState: unknown }).currentState = originalState;
});

describe('ReactNativeAppVisibility', () => {
  it('current는 background일 때만 background다(콜드 스타트의 unknown·inactive는 foreground)', () => {
    expect(setup('active').visibility.current()).toBe('foreground');
    expect(setup('inactive').visibility.current()).toBe('foreground');
    expect(setup('unknown' as never).visibility.current()).toBe('foreground');
    expect(setup('background').visibility.current()).toBe('background');
  });

  it('background와 active 전환을 알린다', () => {
    const h = setup();
    h.emit('background');
    h.emit('active');
    expect(h.received).toEqual(['background', 'foreground']);
  });

  it('iOS inactive(알림 센터 등)는 알리지 않고, 같은 값 반복도 한 번만 알린다', () => {
    const h = setup();
    h.emit('inactive');
    h.emit('active');
    expect(h.received).toEqual([]);
    h.emit('inactive');
    h.emit('background');
    h.emit('background');
    h.emit('inactive');
    h.emit('active');
    expect(h.received).toEqual(['background', 'foreground']);
  });

  it('해제 함수는 AppState 구독을 제거한다', () => {
    const h = setup();
    h.stop();
    expect(h.remove).toHaveBeenCalledTimes(1);
  });
});
