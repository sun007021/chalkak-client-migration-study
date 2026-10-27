export type Listener = () => void;
/** 리스너·수명주기 훅에서 던진 예외를 받는 함수. */
export type ErrorReporter = (error: unknown) => void;

const defaultErrorReporter: ErrorReporter = (error) => {
  console.error('[Observable] listener error', error);
};

interface Subscription {
  readonly listener: Listener;
  active: boolean;
}

/**
 * React와 무관한 상태 보관소. ViewModel이 상속해서 쓴다.
 *
 * - 상태는 `Readonly<T>`로만 노출한다. 바꾸려면 `setState`로 새 객체를 넘긴다.
 * - 같은 함수를 두 번 `subscribe`하면 구독이 두 개이며 각각 따로 해제된다(알림도 두 번).
 * - 알림은 구독 시점의 스냅샷을 순회한다. 알림 중 구독/해제해도 이번 순회는 흔들리지 않되,
 *   알림 중 해제된 리스너는 이번 순회에서도 호출하지 않는다.
 * - 리스너 하나가 던져도 나머지는 호출되고, 예외는 `reportError`로 보고된다.
 */
export class Observable<T> {
  private readonly subscriptions = new Set<Subscription>();
  private state: Readonly<T>;
  private disposed = false;

  constructor(
    initialState: Readonly<T>,
    private readonly reportError: ErrorReporter = defaultErrorReporter,
  ) {
    this.state = initialState;
  }

  // getSnapshot/subscribe는 화살표 프로퍼티다. `useSyncExternalStore(vm.subscribe, vm.getSnapshot)`처럼
  // 메서드를 떼어 넘겨도 `this`가 유지되어야 하고, 매 렌더 같은 함수 참조여야 불필요한 재구독이 없다.
  getSnapshot = (): Readonly<T> => this.state;

  /** 구독을 등록하고 해제 함수를 돌려준다. 해제 함수는 여러 번 불러도 안전하다. dispose 뒤에는 아무것도 등록하지 않는다. */
  subscribe = (listener: Listener): (() => void) => {
    if (this.disposed) return () => {};
    const subscription: Subscription = { listener, active: true };
    this.subscriptions.add(subscription);
    if (this.subscriptions.size === 1) this.runHook(() => this.onFirstSubscribe());
    return () => this.remove(subscription);
  };

  /** 모든 구독을 해제하고(마지막 구독자가 있었다면 `onLastUnsubscribe` 호출) 이후 구독을 받지 않는다. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const hadSubscribers = this.subscriptions.size > 0;
    this.subscriptions.forEach((subscription) => (subscription.active = false));
    this.subscriptions.clear();
    if (hadSubscribers) this.runHook(() => this.onLastUnsubscribe());
  }

  /** 구독자가 0명에서 1명이 될 때 호출된다(예: 폴링 시작). 서브클래스가 재정의한다. */
  protected onFirstSubscribe(): void {}

  /** 구독자가 1명에서 0명이 될 때(또는 dispose 때) 호출된다(예: 폴링 중단). 서브클래스가 재정의한다. */
  protected onLastUnsubscribe(): void {}

  /**
   * 상태를 바꾼다. 객체를 제자리에서 고치지 말고 **새 객체**를 넘겨야 한다
   * (`Object.is`가 같으면 변경이 없다고 보고 알리지 않는다). 함수를 넘기면 이전 상태에서 계산한다.
   * 상태 타입 T가 함수 타입이면 사용할 수 없다.
   */
  protected setState(next: Readonly<T> | ((prev: Readonly<T>) => Readonly<T>)): void {
    const value =
      typeof next === 'function' ? (next as (prev: Readonly<T>) => Readonly<T>)(this.state) : next;
    if (Object.is(value, this.state)) return;
    this.state = value;
    this.notify();
  }

  private notify(): void {
    for (const subscription of [...this.subscriptions]) {
      if (!subscription.active) continue;
      this.runHook(subscription.listener);
    }
  }

  private remove(subscription: Subscription): void {
    if (!subscription.active) return;
    subscription.active = false;
    this.subscriptions.delete(subscription);
    if (this.subscriptions.size === 0) this.runHook(() => this.onLastUnsubscribe());
  }

  private runHook(hook: () => void): void {
    try {
      hook();
    } catch (error) {
      this.reportError(error);
    }
  }
}
