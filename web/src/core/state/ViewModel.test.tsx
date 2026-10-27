import { act, render, screen } from '@testing-library/react';
import { ViewModel } from './ViewModel';
import { useViewModel } from './useViewModel';

class CounterVm extends ViewModel<{ count: number; label: string }> {
  constructor() {
    super({ count: 0, label: 'a' });
  }
  inc() {
    this.setState({ count: this.state.count + 1 });
  }
  setLabel(label: string) {
    this.setState({ label });
  }
}

describe('ViewModel', () => {
  it('state는 초기값에서 시작하고 setState는 얕게 병합한다', () => {
    const vm = new CounterVm();
    expect(vm.state).toEqual({ count: 0, label: 'a' });
    vm.inc();
    expect(vm.state).toEqual({ count: 1, label: 'a' });
  });

  it('구독자는 상태가 바뀔 때 알림을 받고 해제하면 받지 않는다', () => {
    const vm = new CounterVm();
    const listener = vi.fn();
    const off = vm.subscribe(listener);
    vm.inc();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    vm.inc();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('값이 하나도 바뀌지 않으면 state 참조와 알림을 유지한다', () => {
    const vm = new CounterVm();
    const before = vm.state;
    const listener = vi.fn();
    vm.subscribe(listener);
    vm.setLabel('a');
    expect(vm.state).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose 뒤에는 알림을 보내지 않는다', () => {
    const vm = new CounterVm();
    const listener = vi.fn();
    vm.subscribe(listener);
    vm.dispose();
    vm.inc();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('useViewModel', () => {
  it('상태가 바뀌면 화면이 다시 그려진다', () => {
    const vm = new CounterVm();
    function Counter() {
      const s = useViewModel(vm);
      return <span data-testid="count">{s.count}</span>;
    }
    render(<Counter />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    act(() => vm.inc());
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});
