import { bindToastVisibility } from './bindToastVisibility';
import type { VisibilitySource } from './bindToastVisibility';
import { ToastController } from './ToastController';
import { FakeClock } from '../../test/FakeClock';
import { SequentialIdGenerator } from '../../test/sequentialIds';

class FakeDocument implements VisibilitySource {
  visibilityState: string = 'visible';
  private readonly listeners = new Set<() => void>();
  addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  setVisibility(state: string): void {
    this.visibilityState = state;
    [...this.listeners].forEach((l) => l());
  }
}

function setup(initial = 'visible') {
  const toast = new ToastController({ clock: new FakeClock(), ids: new SequentialIdGenerator() });
  const doc = new FakeDocument();
  doc.visibilityState = initial;
  return { toast, doc };
}

describe('bindToastVisibility', () => {
  it('TC-NAV-028 문서가 보이지 않는 동안 요청된 토스트는 표시하지 않고 쌓지도 않는다', () => {
    const { toast, doc } = setup();
    bindToastVisibility(toast, doc);
    doc.setVisibility('hidden');
    toast.show('백그라운드에서 온 토스트');
    expect(toast.state.toast).toBeNull();
    doc.setVisibility('visible');
    expect(toast.state.toast).toBeNull(); // 돌아와도 밀린 토스트가 나오지 않는다
  });

  it('TC-NAV-028 이미 숨겨진 상태로 시작해도 바로 반영한다', () => {
    const { toast, doc } = setup('hidden');
    bindToastVisibility(toast, doc);
    toast.show('숨김 상태');
    expect(toast.state.toast).toBeNull();
  });

  it('TC-NAV-028 떠 있던 토스트는 문서가 숨겨지면 사라지고 다시 보이게 되면 새 요청은 받는다', () => {
    const { toast, doc } = setup();
    bindToastVisibility(toast, doc);
    toast.show('보이는 중');
    doc.setVisibility('hidden');
    expect(toast.state.toast).toBeNull();
    doc.setVisibility('visible');
    toast.show('다시 보임');
    expect(toast.state.toast?.message).toBe('다시 보임');
  });

  it('해제하면 리스너가 빠지고 이후 가시성 변화는 반영하지 않는다', () => {
    const { toast, doc } = setup();
    const unbind = bindToastVisibility(toast, doc);
    expect(doc.listenerCount).toBe(1);
    unbind();
    expect(doc.listenerCount).toBe(0);
    doc.setVisibility('hidden');
    toast.show('해제 뒤');
    expect(toast.state.toast?.message).toBe('해제 뒤');
  });
});
