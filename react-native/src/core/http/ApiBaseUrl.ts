/** API_BASE_URL을 검증해 끝에 `/`가 붙은 https 주소로 돌려준다. 없음·빈 값·http·잘못된 값은 ConfigError. 폴백 없음. */
export function parseApiBaseUrl(_raw: string | undefined | null): string {
  throw new Error('not implemented');
}
