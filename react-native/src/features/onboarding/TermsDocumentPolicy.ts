import { TERMS_ALLOWED_HOSTS } from '../../shared/constants';

/** 약관 문서를 어디서 열지(D-25). */
export type DocumentTarget =
  /** https + 허용 호스트(TERMS_ALLOWED_HOSTS 또는 그 하위 도메인), userinfo 없음 -> 앱 안 웹뷰 */
  | 'in-app'
  /** 해석되는 http(s) URL이지만 허용 호스트가 아니다 -> 외부 브라우저 */
  | 'external'
  /** 빈 문자열, 해석 불가, http(s)가 아닌 scheme -> 열지 않는다("문서를 열 수 없어요") */
  | 'reject';

const HTTP_URL = /^(https?):\/\/([^/?#]*)/i;

/**
 * RN(Hermes)의 URL 구현은 일부 접근자가 없어 직접 해석한다. authority만 보고 판단한다:
 * userinfo(`@`)가 있으면 호스트 위장 가능성이 있어 앱 안에서 열지 않고, 포트는 443만 허용한다.
 */
export function decideDocumentTarget(url: string): DocumentTarget {
  const match = HTTP_URL.exec(url.trim());
  if (!match) return 'reject';
  const scheme = match[1].toLowerCase();
  const authority = match[2];
  if (authority === '' || /\s/.test(authority)) return 'reject';
  if (authority.includes('@') || authority.startsWith('[')) return 'external';

  const [host, port, ...rest] = authority.toLowerCase().split(':');
  if (host === '') return 'reject';
  if (rest.length > 0) return 'external';
  if (scheme !== 'https' || (port !== undefined && port !== '' && port !== '443')) {
    return 'external';
  }
  const allowed = TERMS_ALLOWED_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
  return allowed ? 'in-app' : 'external';
}
