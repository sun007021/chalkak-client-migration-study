import { STRICT_HOST } from '../../core/config/hostSyntax';
import { TERMS_ALLOWED_HOSTS } from '../../shared/constants';

/** 약관 문서를 어디서 열지(D-25). */
export type DocumentTarget =
  /** https + 허용 호스트(TERMS_ALLOWED_HOSTS 또는 그 하위 도메인), userinfo 없음 -> 앱 안 웹뷰 */
  | 'in-app'
  /** 해석되는 http(s) URL이지만 허용 호스트가 아니다 -> 외부 브라우저 */
  | 'external'
  /** 빈 문자열, 해석 불가, http(s)가 아닌 scheme, 호스트가 엄격한 문법에 맞지 않음 -> 열지 않는다("문서를 열 수 없어요") */
  | 'reject';

const HTTP_URL = /^(https?):\/\/([^/?#]*)/i;
const UNSAFE_CHARS = /[\\\s\u0000-\u001f\u007f]/;

/** 판정에 쓰는 정규화: 앞뒤 공백을 자른다. 실제로 여는 값도 이 함수를 거친 값을 써야 한다. */
export function normalizeDocumentUrl(url: string): string {
  return url.trim();
}

/**
 * RN(Hermes)의 URL 구현은 일부 접근자가 없어 직접 해석한다. authority만 보고 판단한다.
 * `\`·공백·제어문자가 있으면 파서마다 해석이 갈리므로 거부하고, 호스트는 엄격한 문법(소문자 영문·숫자·하이픈·점)만 허용한다.
 * userinfo(`@`)·비 443 포트·http는 앱 안에서 열지 않는다.
 */
export function decideDocumentTarget(url: string): DocumentTarget {
  const value = normalizeDocumentUrl(url);
  if (UNSAFE_CHARS.test(value)) return 'reject';
  const match = HTTP_URL.exec(value);
  if (!match) return 'reject';
  const scheme = match[1].toLowerCase();
  const authority = match[2];
  if (authority === '') return 'reject';
  if (authority.includes('@')) return 'external';

  const [host, port, ...rest] = authority.toLowerCase().split(':');
  if (!STRICT_HOST.test(host)) return 'reject';
  if (rest.length > 0) return 'reject';
  if (port !== undefined && !/^\d{1,5}$/.test(port)) return 'reject';
  if (scheme !== 'https' || (port !== undefined && port !== '443')) return 'external';
  const allowed = TERMS_ALLOWED_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
  return allowed ? 'in-app' : 'external';
}
