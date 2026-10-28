import type { IdGenerator } from '../../core/ids';
import type { Clock } from '../../core/time/Clock';
import { KakaoTokenEndpointExchanger, KakaoWebLoginClient } from './KakaoWebLoginClient';
import { WebCryptoNonceGenerator } from './nonce';

/** 실제 카카오 웹 로그인 클라이언트 조립. 리다이렉트 URI는 페이지 출처 + 콜백 경로. */
export function createKakaoWebLoginClient(deps: {
  clientId: string;
  redirectUri: string;
  fetch: typeof fetch;
  clock: Clock;
  ids: IdGenerator;
}): KakaoWebLoginClient {
  return new KakaoWebLoginClient({
    config: { clientId: deps.clientId, redirectUri: deps.redirectUri },
    nonce: new WebCryptoNonceGenerator(),
    state: deps.ids,
    storage: {
      getItem: (key) => globalThis.sessionStorage.getItem(key),
      setItem: (key, value) => globalThis.sessionStorage.setItem(key, value),
      removeItem: (key) => globalThis.sessionStorage.removeItem(key),
    },
    redirect: (url) => globalThis.location.assign(url),
    exchanger: new KakaoTokenEndpointExchanger({ clientId: deps.clientId, fetch: deps.fetch, clock: deps.clock }),
  });
}
