import { FakeAppVisibility } from '../lifecycle/__testing__/FakeAppVisibility';
import { ToastCenter } from './ToastCenter';

function setup() {
  jest.useFakeTimers();
  const visibility = new FakeAppVisibility();
  const center = new ToastCenter({ visibility, durationMs: 2500 });
  return { visibility, center };
}

afterEach(() => jest.useRealTimers());

describe('ToastCenter', () => {
  it('REQ-NET-030 문구를 띄우고 2.5초 뒤 지운다', () => {
    const { center } = setup();
    center.show('안녕');
    expect(center.getSnapshot().current?.message).toBe('안녕');
    jest.advanceTimersByTime(2499);
    expect(center.getSnapshot().current).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(center.getSnapshot().current).toBeNull();
  });

  it('REQ-NET-030 같은 문구가 연달아 와도 id가 달라 매번 새로 그리고 타이머를 다시 시작한다', () => {
    const { center } = setup();
    center.show('같은 문구');
    const first = center.getSnapshot().current;
    jest.advanceTimersByTime(2000);
    center.show('같은 문구');
    const second = center.getSnapshot().current;
    expect(second?.id).not.toBe(first?.id);
    jest.advanceTimersByTime(2000);
    expect(center.getSnapshot().current).not.toBeNull();
    jest.advanceTimersByTime(500);
    expect(center.getSnapshot().current).toBeNull();
  });

  it('REQ-NET-030 앱이 백그라운드이면 띄우지 않고 버린다', () => {
    const { center, visibility } = setup();
    visibility.emit('background');
    center.show('버려짐');
    expect(center.getSnapshot().current).toBeNull();
  });

  it('dispose하면 타이머를 정리한다', () => {
    const { center } = setup();
    center.show('x');
    center.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });
});
