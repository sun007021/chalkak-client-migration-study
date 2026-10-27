import type { SessionState } from '../session/SessionStore';
import type { AuthLevel } from './RequestPolicy';

/**
 * Authorization 헤더 값(`Bearer ...`) 또는 undefined.
 * level none, 비 https URL, 게스트·세션 없음, access token 만료(만료 시각 <= now)면 undefined.
 */
export function authorizationHeaderFor(_input: {
  url: string;
  level: AuthLevel;
  session: SessionState;
  now: Date;
}): string | undefined {
  throw new Error('not implemented');
}
