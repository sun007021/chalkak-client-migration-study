import { ApiError, CancelledError, NetworkError } from './ApiError';

/**
 * transport가 던진 값을 ApiError로 통일한다. 취소는 CancelledError, fetch의 TypeError(연결 실패·DNS·TLS)는
 * NetworkError. 그 밖의 알 수 없는 예외는 버그일 수 있으므로 바꾸지 않고 그대로 다시 던진다.
 */
export function toApiError(error: unknown, signal?: AbortSignal): ApiError {
  if (signal?.aborted) return new CancelledError('aborted');
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.name === 'AbortError') return new CancelledError('aborted');
  if (error instanceof TypeError) return new NetworkError(error.name);
  throw error;
}
