import { STRICT_HOST } from './hostSyntax';

/**
 * https가 아닌 http를 허용하는 loopback 호스트(팀장 결정).
 * E2E mock 서버가 개발 머신의 localhost(iOS 시뮬레이터)나 10.0.2.2(Android 에뮬레이터 -> 호스트)에서
 * 평문 http로 떠 있기 때문이다. 외부로 나가지 않는 주소만 허용하므로 TLS 요구(REQ-NET-001)의 취지를 해치지 않는다.
 */
export const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '10.0.2.2'];

const UNSAFE_CHARS = /[\\\s\u0000-\u001f\u007f]/;

/**
 * https 이거나 loopback 호스트의 http인 URL이면 true. 인증 헤더 부착·리다이렉트 검사에 같은 규칙을 쓴다.
 * `\`·공백·제어문자는 파서마다 호스트 해석이 갈리므로 거부하고, 호스트는 엄격한 문자 집합(소문자 영문·숫자·하이픈·점)만 허용한다.
 */
export function isAllowedTransportUrl(url: string): boolean {
  const value = url.trim();
  if (UNSAFE_CHARS.test(value)) return false;
  const match = /^(https?):\/\/(?:[^/?#@]*@)?([^/?#:]*)/i.exec(value);
  if (!match) return false;
  const host = match[2].toLowerCase();
  if (!STRICT_HOST.test(host)) return false;
  if (match[1].toLowerCase() === 'https') return true;
  return LOOPBACK_HOSTS.includes(host);
}
