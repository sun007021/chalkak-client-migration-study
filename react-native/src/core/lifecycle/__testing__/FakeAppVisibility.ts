import type { AppState, AppVisibility } from '../AppVisibility';

export class FakeAppVisibility implements AppVisibility {
  private state: AppState = 'foreground';
  private readonly listeners = new Set<(state: AppState) => void>();

  current(): AppState {
    return this.state;
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 상태를 바꾸고 구독자에게 알린다. */
  emit(state: AppState): void {
    this.state = state;
    [...this.listeners].forEach((listener) => listener(state));
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
