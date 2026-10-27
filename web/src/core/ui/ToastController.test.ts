import { ToastController } from './ToastController';
import { FakeClock } from '../../test/FakeClock';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import { TOAST_DURATION_MS } from '../../constants';

function setup() {
  const clock = new FakeClock();
  const toast = new ToastController({ clock, ids: new SequentialIdGenerator() });
  return { clock, toast };
}

describe('ToastController', () => {
  it('REQ-NET-030 TC-TIME-030 토스트는 2.5초 동안 보였다가 사라진다(실제로 기다리지 않는다)', async () => {
    const { clock, toast } = setup();
    toast.show('저장했어요');
    expect(toast.state.toast?.message).toBe('저장했어요');
    await clock.advance(TOAST_DURATION_MS - 1);
    expect(toast.state.toast).not.toBeNull();
    await clock.advance(1);
    expect(toast.state.toast).toBeNull();
    expect(clock.pendingTimers).toBe(0);
  });

  it('REQ-NET-030 같은 문구가 연달아 나와도 고유 ID가 달라 다시 표시되고 타이머가 처음부터 시작한다', async () => {
    const { clock, toast } = setup();
    toast.show('같은 문구');
    const first = toast.state.toast!;
    await clock.advance(2_000);
    toast.show('같은 문구');
    const second = toast.state.toast!;
    expect(second.message).toBe(first.message);
    expect(second.id).not.toBe(first.id);
    await clock.advance(1_000); // 첫 토스트였다면 이미 사라졌을 시점(3.0초)
    expect(toast.state.toast?.id).toBe(second.id);
    await clock.advance(1_500);
    expect(toast.state.toast).toBeNull();
  });

  it('REQ-NET-030 구독자는 표시와 새 ID마다 알림을 받는다', () => {
    const { toast } = setup();
    const listener = vi.fn();
    toast.subscribe(listener);
    toast.show('a');
    toast.show('a');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('REQ-NET-030 화면이 보이지 않을 때 온 토스트는 버리고, 보이게 된 뒤에는 다시 받는다', () => {
    const { toast } = setup();
    toast.setVisible(false);
    toast.show('숨김 중');
    expect(toast.state.toast).toBeNull();
    toast.setVisible(true);
    toast.show('다시 보임');
    expect(toast.state.toast?.message).toBe('다시 보임');
  });

  it('REQ-NET-030 떠 있는 토스트는 화면이 숨겨지면 사라지고 타이머도 정리된다', () => {
    const { clock, toast } = setup();
    toast.show('보이는 중');
    toast.setVisible(false);
    expect(toast.state.toast).toBeNull();
    expect(clock.pendingTimers).toBe(0);
  });

  it('REQ-NET-030 서로 다른 토스트의 ID는 모두 고유하다', () => {
    const { toast } = setup();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      toast.show('x');
      ids.add(toast.state.toast!.id);
    }
    expect(ids.size).toBe(20);
  });
});
