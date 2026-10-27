import { HTTP_RESPONSE_TIMEOUT_MS } from '../../constants';
import type { ApiBaseUrl } from '../config/apiBaseUrl';
import type { AuthTokens } from '../auth/SessionStore';
import type { Clock } from '../time/Clock';
import { d } from './decode';
import { InvalidResponseError, parseErrorResponse } from './errors';
import { HttpTransport } from './HttpTransport';
import type { Logger } from './Logger';
import { buildUrl } from './url';

export type RefreshResult =
  | { kind: 'success'; tokens: AuthTokens }
  | { kind: 'reauthentication_required' }
  /** 네트워크 오류·타임아웃·5xx·응답 해석 불가·400(클라이언트 버그). 세션은 유지하고 그 요청만 실패시킨다. */
  | { kind: 'transient_failure'; error: unknown };

export interface TokenRefresher {
  /** 던지지 않는다. 자동 재시도하지 않는다(REQ-NET-022). */
  refresh(refreshToken: string): Promise<RefreshResult>;
}

export interface HttpTokenRefresherDeps {
  fetch: typeof fetch;
  clock: Clock;
  baseUrl: ApiBaseUrl;
  logger?: Logger;
}

const decodeRefreshResponse = d.object({
  accessToken: d.string(),
  expiresIn: d.number(),
  refreshToken: d.string(),
  refreshTokenExpiresIn: d.number(),
});

/** POST /auth/refresh {refreshToken}. Authorization 없음, 재시도 없음. 만료 시각은 clock.nowMs() + expiresIn초. */
export class HttpTokenRefresher implements TokenRefresher {
  private readonly transport: HttpTransport;

  constructor(private readonly deps: HttpTokenRefresherDeps) {
    this.transport = new HttpTransport({ fetch: deps.fetch, clock: deps.clock, logger: deps.logger });
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    try {
      const response = await this.transport.send({
        method: 'POST',
        url: buildUrl(this.deps.baseUrl, '/auth/refresh'),
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        timeoutMs: HTTP_RESPONSE_TIMEOUT_MS,
        retry: false,
      });
      if (response.status >= 200 && response.status < 300) return this.success(response.text);
      const error = parseErrorResponse(response.status, response.text);
      if (error.status === 401 && error.errorCode === 'REAUTHENTICATION_REQUIRED') return { kind: 'reauthentication_required' };
      if (error.status === 400) this.deps.logger?.log('error', 'token refresh rejected with 400 (client bug)', { status: 400 });
      return { kind: 'transient_failure', error };
    } catch (error) {
      return { kind: 'transient_failure', error };
    }
  }

  private success(text: string): RefreshResult {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      return { kind: 'transient_failure', error: new InvalidResponseError('refresh response is not JSON', error) };
    }
    try {
      const body = decodeRefreshResponse(json);
      const now = this.deps.clock.nowMs();
      return {
        kind: 'success',
        tokens: {
          accessToken: body.accessToken,
          accessTokenExpiresAt: now + body.expiresIn * 1000,
          refreshToken: body.refreshToken,
          refreshTokenExpiresAt: now + body.refreshTokenExpiresIn * 1000,
        },
      };
    } catch (error) {
      return { kind: 'transient_failure', error };
    }
  }
}
