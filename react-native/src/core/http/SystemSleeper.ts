import { CancelledError } from './ApiError';
import type { Sleeper } from './Sleeper';

export class SystemSleeper implements Sleeper {
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new CancelledError('aborted'));
      const onAbort = () => {
        clearTimeout(timer);
        reject(new CancelledError('aborted'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
