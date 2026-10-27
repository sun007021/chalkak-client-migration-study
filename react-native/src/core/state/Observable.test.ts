import { Observable } from './Observable';

class Counter extends Observable<{ count: number }> {
  constructor() {
    super({ count: 0 });
  }
  increment() {
    this.setState((s) => ({ count: s.count + 1 }));
  }
  noop() {
    this.setState(this.getSnapshot());
  }
}

describe('Observable', () => {
  it('상태가 바뀌면 구독자에게 알린다', () => {
    const vm = new Counter();
    const listener = jest.fn();
    vm.subscribe(listener);
    vm.increment();
    expect(vm.getSnapshot().count).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('같은 상태면 알리지 않고, 구독 해제 후에는 알리지 않는다', () => {
    const vm = new Counter();
    const listener = jest.fn();
    const unsubscribe = vm.subscribe(listener);
    vm.noop();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    vm.increment();
    expect(listener).not.toHaveBeenCalled();
  });
});
