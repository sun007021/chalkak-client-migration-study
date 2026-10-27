export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
};

export type HttpResponse = {
  status: number;
  /** 키는 소문자. */
  headers: Record<string, string>;
  bodyText: string;
};

export type SendOptions = {
  signal?: AbortSignal;
  /** 응답 헤더를 받을 때까지(연결) 한도. */
  connectTimeoutMs: number;
  /** 요청 시작부터 본문 수신 완료까지 전체 한도. */
  responseTimeoutMs: number;
};

/**
 * fetch 래퍼. 구현 계약:
 * - 타임아웃이면 TimeoutError, 연결 실패 등은 NetworkError, 호출자 signal 취소는 CancelledError를 던진다.
 * - 3xx를 따라가지 않고 그대로 돌려준다(비 https 리다이렉트 금지, REQ-NET-016).
 * - 4xx/5xx도 throw하지 않고 응답으로 돌려준다.
 */
export interface HttpTransport {
  send(request: HttpRequest, options: SendOptions): Promise<HttpResponse>;
}
