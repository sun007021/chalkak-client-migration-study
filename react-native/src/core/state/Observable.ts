export type Listener = () => void;

/** React와 무관한 상태 보관소. ViewModel이 상속/합성해서 쓴다. */
export class Observable<T> {
  private listeners = new Set<Listener>();

  constructor(private state: T) {}

  getSnapshot = (): T => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  protected setState(next: T | ((prev: T) => T)): void {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(this.state) : next;
    if (Object.is(value, this.state)) return;
    this.state = value;
    this.listeners.forEach((l) => l());
  }
}
