import { type ErrorReporter, Observable } from '../Observable';

export interface CounterState {
  count: number;
  label: string;
}

/** Observable/훅 테스트용 최소 ViewModel. `count`와 무관한 `label` 필드로 selector를 검증한다. */
export class Counter extends Observable<CounterState> {
  firstSubscribeCalls = 0;
  lastUnsubscribeCalls = 0;

  constructor(reportError?: ErrorReporter) {
    super({ count: 0, label: '' }, reportError);
  }

  increment(): void {
    this.setState((s) => ({ ...s, count: s.count + 1 }));
  }

  setLabel(label: string): void {
    this.setState((s) => ({ ...s, label }));
  }

  /** 같은 객체를 다시 넘긴다(변경 없음). */
  noop(): void {
    this.setState(this.getSnapshot());
  }

  protected override onFirstSubscribe(): void {
    this.firstSubscribeCalls += 1;
  }

  protected override onLastUnsubscribe(): void {
    this.lastUnsubscribeCalls += 1;
  }
}
