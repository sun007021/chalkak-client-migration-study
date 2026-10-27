import type { SessionMode } from '../features/boot/authGate';
import type { HomePreloader } from '../features/boot/HomePreloader';

/** 프리로드를 테스트가 끝내는 Fake. */
export class FakeHomePreloader implements HomePreloader {
  readonly calls: SessionMode[] = [];
  readonly signals: AbortSignal[] = [];
  private waiters: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  private mode: 'pending' | 'resolve' | 'reject' = 'pending';

  /** 호출 즉시 끝나게 한다. */
  resolveImmediately(): this {
    this.mode = 'resolve';
    return this;
  }
  rejectImmediately(): this {
    this.mode = 'reject';
    return this;
  }
  finish(): void {
    this.waiters.splice(0).forEach((w) => w.resolve());
  }
  fail(error: Error = new Error('preload failed')): void {
    this.waiters.splice(0).forEach((w) => w.reject(error));
  }

  preload(mode: SessionMode, signal: AbortSignal): Promise<void> {
    this.calls.push(mode);
    this.signals.push(signal);
    if (this.mode === 'resolve') return Promise.resolve();
    if (this.mode === 'reject') return Promise.reject(new Error('preload failed'));
    return new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
}
