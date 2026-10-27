import { isAllowedTransportUrl } from '../config/transportSecurity';
import type { SessionState } from '../session/SessionStore';
import type { AuthLevel } from './RequestPolicy';

/**
 * Authorization 헤더 값(`Bearer ...`) 또는 undefined.
 * level none, 비 https URL(loopback 예외), 게스트·세션 없음, access token 만료(만료 시각 <= now)면 undefined.
 */
export function authorizationHeaderFor(input: {
  url: string;
  level: AuthLevel;
  session: SessionState;
  now: Date;
}): string | undefined {
  if (input.level === 'none') return undefined;
  if (!isAllowedTransportUrl(input.url)) return undefined;
  if (input.session.kind !== 'authenticated') return undefined;
  const { accessToken, accessTokenExpiresAt } = input.session.credentials;
  if (accessTokenExpiresAt.getTime() <= input.now.getTime()) return undefined;
  return `Bearer ${accessToken}`;
}
