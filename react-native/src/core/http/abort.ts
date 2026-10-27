import { CancelledError } from './ApiError';

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError('aborted');
}

/**
 * promise를 기다리되 signal이 abort되면 CancelledError로 먼저 끝낸다.
 * 원래 promise는 계속 진행된다(여러 호출자가 공유하는 갱신 작업을 취소하지 않기 위해).
 */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      promise.catch(() => undefined);
      return reject(new CancelledError('aborted'));
    }
    const onAbort = () => reject(new CancelledError('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
