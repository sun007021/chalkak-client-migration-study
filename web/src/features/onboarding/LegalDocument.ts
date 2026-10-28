import { TERMS_ALLOWED_HOSTS, TERMS_URLS } from '../../constants';
import type { ExternalLinkOpener } from './ExternalLinkOpener';

export type LegalDocumentKind = 'service' | 'privacy';

/** opened: 새 탭을 열었다. blocked: 허용 호스트가 아니라 열지 않았다. failed: 브라우저가 열지 못했다(팝업 차단 등). blocked·failed 모두 "문서를 열 수 없어요". */
export type LegalOpenResult = 'opened' | 'blocked' | 'failed';

/**
 * 약관 문서 URL 허용 판정(D-25, REQ-ONB-008). https이고 userinfo가 없으며 호스트가 TERMS_ALLOWED_HOSTS 중 하나이거나 그 하위 도메인일 때만 true.
 * 대소문자 무시. 접미 문자열 일치가 아니라 도메인 경계로 판정한다(notion.com.evil.example, evilnotion.so 는 거절).
 */
export function isAllowedLegalDocumentUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim() === raw ? raw : '');
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  return TERMS_ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** 공통 상수 URL(TERMS_URLS)을 허용 검사 후 opener로 연다. 허용되지 않으면 opener를 부르지 않는다. opener가 던져도 failed. */
export class LegalDocumentLauncher {
  constructor(private readonly deps: { opener: ExternalLinkOpener }) {}

  open(kind: LegalDocumentKind): LegalOpenResult {
    const url = TERMS_URLS[kind];
    if (!isAllowedLegalDocumentUrl(url)) return 'blocked';
    try {
      return this.deps.opener.open(url) ? 'opened' : 'failed';
    } catch {
      return 'failed';
    }
  }
}
