import { Counter } from './__testing__/Counter';
import { Observable } from './Observable';

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

  it('여러 구독자 모두에게 알리고 하나를 해제해도 나머지는 계속 받는다', () => {
    const vm = new Counter();
    const a = jest.fn();
    const b = jest.fn();
    const unsubscribeA = vm.subscribe(a);
    vm.subscribe(b);
    vm.increment();
    unsubscribeA();
    vm.increment();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('같은 리스너를 두 번 등록하면 구독이 두 개이고 각각 따로 해제된다', () => {
    const vm = new Counter();
    const listener = jest.fn();
    const first = vm.subscribe(listener);
    vm.subscribe(listener);
    vm.increment();
    expect(listener).toHaveBeenCalledTimes(2);
    first();
    vm.increment();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('unsubscribe를 두 번 불러도 안전하고 다른 구독을 건드리지 않는다', () => {
    const vm = new Counter();
    const listener = jest.fn();
    const other = jest.fn();
    const unsubscribe = vm.subscribe(listener);
    vm.subscribe(other);
    unsubscribe();
    unsubscribe();
    vm.increment();
    expect(listener).not.toHaveBeenCalled();
    expect(other).toHaveBeenCalledTimes(1);
    expect(vm.lastUnsubscribeCalls).toBe(0);
  });

  it('알림 중에 다른 구독자를 해제하면 이번 순회에서도 호출하지 않는다', () => {
    const vm = new Counter();
    const b = jest.fn();
    let unsubscribeB = () => {};
    vm.subscribe(() => unsubscribeB());
    unsubscribeB = vm.subscribe(b);
    vm.increment();
    expect(b).not.toHaveBeenCalled();
  });

  it('알림 중에 새로 구독한 리스너는 이번 알림을 받지 않는다', () => {
    const vm = new Counter();
    const late = jest.fn();
    vm.subscribe(() => {
      vm.subscribe(late);
    });
    vm.increment();
    expect(late).not.toHaveBeenCalled();
    vm.increment();
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('리스너 하나가 던져도 나머지는 호출되고 예외는 보고된다', () => {
    const reportError = jest.fn();
    const vm = new Counter(reportError);
    const boom = new Error('boom');
    const after = jest.fn();
    vm.subscribe(() => {
      throw boom;
    });
    vm.subscribe(after);
    expect(() => vm.increment()).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(boom);
    expect(vm.getSnapshot().count).toBe(1);
  });

  it('오류 보고 함수를 주지 않으면 console.error로 보고한다', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const vm = new Counter();
      vm.subscribe(() => {
        throw new Error('boom');
      });
      vm.increment();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  describe('수명주기 훅', () => {
    it('onFirstSubscribe는 0에서 1이 될 때만, onLastUnsubscribe는 1에서 0이 될 때만 호출된다', () => {
      const vm = new Counter();
      const first = vm.subscribe(() => {});
      expect(vm.firstSubscribeCalls).toBe(1);
      const second = vm.subscribe(() => {});
      expect(vm.firstSubscribeCalls).toBe(1);
      first();
      expect(vm.lastUnsubscribeCalls).toBe(0);
      second();
      expect(vm.lastUnsubscribeCalls).toBe(1);
      vm.subscribe(() => {});
      expect(vm.firstSubscribeCalls).toBe(2);
    });

    it('onFirstSubscribe는 리스너가 등록된 뒤에 호출된다(훅 안의 setState도 알려진다)', () => {
      class Eager extends Observable<{ ready: boolean }> {
        constructor() {
          super({ ready: false });
        }
        protected override onFirstSubscribe(): void {
          this.setState({ ready: true });
        }
      }
      const vm = new Eager();
      const listener = jest.fn();
      vm.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(vm.getSnapshot().ready).toBe(true);
    });

    it('훅이 던져도 구독은 유지되고 예외는 보고된다', () => {
      const reportError = jest.fn();
      class Broken extends Observable<{ n: number }> {
        constructor() {
          super({ n: 0 }, reportError);
        }
        protected override onFirstSubscribe(): void {
          throw new Error('hook');
        }
      }
      const vm = new Broken();
      expect(() => vm.subscribe(() => {})).not.toThrow();
      expect(reportError).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('모든 구독을 해제하고 onLastUnsubscribe를 한 번 호출한다', () => {
      const vm = new Counter();
      const a = jest.fn();
      const b = jest.fn();
      vm.subscribe(a);
      vm.subscribe(b);
      vm.dispose();
      vm.increment();
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
      expect(vm.lastUnsubscribeCalls).toBe(1);
    });

    it('두 번 불러도 훅은 한 번이고, 구독자가 없었다면 훅을 부르지 않는다', () => {
      const vm = new Counter();
      vm.subscribe(() => {});
      vm.dispose();
      vm.dispose();
      expect(vm.lastUnsubscribeCalls).toBe(1);
      expect(new Counter().lastUnsubscribeCalls).toBe(0);
    });

    it('dispose 뒤의 subscribe는 등록하지 않으며 해제 함수는 안전하다', () => {
      const vm = new Counter();
      vm.dispose();
      const listener = jest.fn();
      const unsubscribe = vm.subscribe(listener);
      vm.increment();
      expect(listener).not.toHaveBeenCalled();
      expect(vm.firstSubscribeCalls).toBe(0);
      expect(() => unsubscribe()).not.toThrow();
    });

    it('이전 구독의 해제 함수를 dispose 뒤에 불러도 훅이 다시 호출되지 않는다', () => {
      const vm = new Counter();
      const unsubscribe = vm.subscribe(() => {});
      vm.dispose();
      unsubscribe();
      expect(vm.lastUnsubscribeCalls).toBe(1);
    });
  });

  it('상태는 새 객체로 바뀌고 이전 스냅샷은 그대로다', () => {
    const vm = new Counter();
    const before = vm.getSnapshot();
    vm.increment();
    expect(vm.getSnapshot()).not.toBe(before);
    expect(before.count).toBe(0);
  });
});
