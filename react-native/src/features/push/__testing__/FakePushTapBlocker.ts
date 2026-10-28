import type { PushTapBlocker } from '../PushTapBlocker';

/** 업로드·피드백 작성 화면이 열려 있는지(REQ-PUSH-031)를 테스트가 직접 정한다. */
export class FakePushTapBlocker implements PushTapBlocker {
  private blocked = false;
  private readonly listeners = new Set<() => void>();

  isBlocked(): boolean {
    return this.blocked;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(blocked: boolean): void {
    this.blocked = blocked;
    [...this.listeners].forEach((listener) => listener());
  }
}
