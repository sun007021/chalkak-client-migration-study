import type { CopyKey } from '../../copy/ko';
import { ConfigError, isCancellation, NetworkError } from './errors';

export type ErrorPresentation =
  | { kind: 'none' }
  | { kind: 'toast'; copy: CopyKey }
  | { kind: 'error_screen'; copy: CopyKey };

/**
 * 사용자에게 보일 공통 문구 키. 서버 message는 쓰지 않는다(D-02, 화면별 문구는 기능 쪽이 fallback으로 준다).
 * NetworkError → common.error.network, ConfigError → common.error.config, 그 밖(ApiError 5xx/4xx, InvalidResponse, 알 수 없는 값) → fallback ?? common.error.generic.
 */
export function userMessageKey(error: unknown, fallback?: CopyKey): CopyKey {
  if (error instanceof NetworkError) return 'common.error.network';
  if (error instanceof ConfigError) return 'common.error.config';
  return fallback ?? 'common.error.generic';
}

/**
 * D-20 오류 표시 선택. 취소는 none, 콘텐츠가 있으면 toast(콘텐츠 유지), 없으면 error_screen(+다시 시도).
 */
export function decideErrorPresentation(input: { error: unknown; hasContent: boolean; fallback?: CopyKey }): ErrorPresentation {
  if (isCancellation(input.error)) return { kind: 'none' };
  const copy = userMessageKey(input.error, input.fallback);
  return { kind: input.hasContent ? 'toast' : 'error_screen', copy };
}
