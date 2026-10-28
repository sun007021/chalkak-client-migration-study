import type { HttpRequest } from '../../core/http/HttpTransport';

/** 요청 URL의 쿼리를 객체로(순서 무관 비교용). */
export const queryOf = (request: HttpRequest): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams.entries());

/** `/api/v1` 뒤 경로. */
export const pathOf = (request: HttpRequest): string =>
  new URL(request.url).pathname.replace(/^\/api\/v1/, '');

/** 헤더 이름은 대소문자를 구분하지 않고 찾는다. */
export const headerOf = (request: HttpRequest, name: string): string | undefined => {
  const wanted = name.toLowerCase();
  return Object.entries(request.headers).find(([key]) => key.toLowerCase() === wanted)?.[1];
};

export const authorizationOf = (request: HttpRequest): string | undefined =>
  headerOf(request, 'authorization');
