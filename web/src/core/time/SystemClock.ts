import type { Clock } from './Clock';

/** 실제 시스템 시계. 시스템 시계를 직접 부르는 유일한 파일(TC-TIME-029 허용 목록). */
export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }
  monotonicMs(): number {
    return performance.now();
  }
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, Math.max(0, ms));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
