import { HTTP_CONNECT_TIMEOUT_MS, HTTP_RESPONSE_TIMEOUT_MS } from '../../shared/constants';
import { InvalidResponseError, parseErrorBody } from './ApiError';
import type { HttpTransport } from './HttpTransport';
import type { RefreshEndpoint, RefreshTokenResponse } from './TokenRefresher';
import { buildUrl } from './UrlBuilder';

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** RefreshEndpoint의 HTTP 구현. 필수 토큰 필드가 없거나 타입이 틀리면 InvalidResponseError. */
export class HttpRefreshEndpoint implements RefreshEndpoint {
  constructor(private readonly deps: { transport: HttpTransport; baseUrl: string }) {}

  async refresh(refreshToken: string): Promise<RefreshTokenResponse> {
    const response = await this.deps.transport.send(
      {
        method: 'POST',
        url: buildUrl(this.deps.baseUrl, '/auth/refresh'),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      },
      {
        connectTimeoutMs: HTTP_CONNECT_TIMEOUT_MS,
        responseTimeoutMs: HTTP_RESPONSE_TIMEOUT_MS,
      },
    );
    if (response.status < 200 || response.status >= 300) {
      throw parseErrorBody(response.status, response.bodyText);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(response.bodyText);
    } catch {
      throw new InvalidResponseError('refresh response is not JSON');
    }
    const o = raw as Partial<Record<keyof RefreshTokenResponse, unknown>> | null;
    if (
      o === null ||
      typeof o !== 'object' ||
      typeof o.accessToken !== 'string' ||
      o.accessToken === '' ||
      typeof o.refreshToken !== 'string' ||
      o.refreshToken === '' ||
      !isSeconds(o.expiresIn) ||
      !isSeconds(o.refreshTokenExpiresIn)
    ) {
      throw new InvalidResponseError('refresh response is missing token fields');
    }
    return {
      accessToken: o.accessToken,
      expiresIn: o.expiresIn,
      refreshToken: o.refreshToken,
      refreshTokenExpiresIn: o.refreshTokenExpiresIn,
    };
  }
}
