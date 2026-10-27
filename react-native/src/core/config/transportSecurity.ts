/**
 * https가 아닌 http를 허용하는 loopback 호스트(팀장 결정).
 * E2E mock 서버가 개발 머신의 localhost(iOS 시뮬레이터)나 10.0.2.2(Android 에뮬레이터 -> 호스트)에서
 * 평문 http로 떠 있기 때문이다. 외부로 나가지 않는 주소만 허용하므로 TLS 요구(REQ-NET-001)의 취지를 해치지 않는다.
 */
export const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '10.0.2.2'];

/** https 이거나 loopback 호스트의 http인 URL이면 true. 인증 헤더 부착·리다이렉트 검사에 같은 규칙을 쓴다. */
export function isAllowedTransportUrl(url: string): boolean {
  const match = /^(https?):\/\/(?:[^/?#@]*@)?(\[[^\]]*\]|[^/?#:]*)/i.exec(url.trim());
  if (!match) return false;
  if (match[1].toLowerCase() === 'https') return true;
  return LOOPBACK_HOSTS.includes(match[2].toLowerCase());
}
