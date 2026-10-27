import type { HttpTransport } from './HttpTransport';
import type { RefreshEndpoint, RefreshTokenResponse } from './TokenRefresher';

/** RefreshEndpoint의 HTTP 구현. 필수 토큰 필드가 없거나 타입이 틀리면 InvalidResponseError. */
export class HttpRefreshEndpoint implements RefreshEndpoint {
  constructor(private readonly deps: { transport: HttpTransport; baseUrl: string }) {}

  refresh(_refreshToken: string): Promise<RefreshTokenResponse> {
    void this.deps;
    throw new Error('not implemented');
  }
}
