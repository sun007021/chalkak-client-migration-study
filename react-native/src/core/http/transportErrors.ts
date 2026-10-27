import { ApiError, CancelledError, NetworkError } from './ApiError';

/** transport가 던진 값을 ApiError로 통일한다. 취소는 CancelledError, 그 밖의 예외는 연결 실패(NetworkError). */
export function toApiError(error: unknown, signal?: AbortSignal): ApiError {
  if (signal?.aborted) return new CancelledError('aborted');
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.name === 'AbortError') return new CancelledError('aborted');
  return new NetworkError(error instanceof Error ? error.name : 'network');
}
