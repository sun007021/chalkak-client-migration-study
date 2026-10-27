import type { ApiBaseUrl } from '../config/apiBaseUrl';

export type QueryValue = string | number | boolean | null | undefined;

/** baseUrl과 path를 슬래시 중복 없이 잇고 쿼리를 붙인다. undefined/null 값은 생략, 숫자는 로캘과 무관한 ASCII 10진수, UUID처럼 보이는 값은 소문자(TC-NET-052, 053). */
export function buildUrl(_baseUrl: ApiBaseUrl, _path: string, _query?: Record<string, QueryValue>): string {
  throw new Error('not implemented');
}

/** UUID는 서버가 소문자만 허용한다(Swift UUID.uuidString은 대문자). */
export function toWireUuid(_id: string): string {
  throw new Error('not implemented');
}
