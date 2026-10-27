import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TERMS_ALLOWED_HOSTS, TERMS_URLS } from '../../shared/constants';
import { decideDocumentTarget } from './TermsDocumentPolicy';

describe('decideDocumentTarget', () => {
  it('TC-ONB-009 약관 URL·허용 호스트는 shared/constants.json과 일치하고 두 URL 모두 앱 안에서 열린다', () => {
    const json = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', '..', 'shared', 'constants.json'), 'utf8'),
    );
    expect(TERMS_URLS).toEqual(json.TERMS_URLS);
    expect([...TERMS_ALLOWED_HOSTS]).toEqual(json.TERMS_ALLOWED_HOSTS);
    expect(decideDocumentTarget(TERMS_URLS.service)).toBe('in-app');
    expect(decideDocumentTarget(TERMS_URLS.privacy)).toBe('in-app');
  });

  it.each([
    'https://www.notion.so/page-123',
    'https://x.notion.site/doc',
    'https://notion.com/terms',
    'https://a.b.notion.site/deep/sub',
    'HTTPS://WWW.NOTION.SO/Upper',
  ])('TC-ONB-010 %s 는 앱 안에서 연다', (url) => {
    expect(decideDocumentTarget(url)).toBe('in-app');
  });

  it.each([
    'http://notion.so/page', // http
    'https://notion.com.evil.example/x', // 접미 속임
    'https://evil.example/notion.so', // 경로에 호스트명
    'https://evilnotion.so/x', // 접두 속임
    'https://notion.so@evil.example/x', // userinfo로 호스트 위장
    'https://user:pw@notion.so/x', // userinfo 포함
    'https://evil.example/?u=https://notion.so',
  ])('TC-ONB-011 %s 는 앱 안에서 열지 않고 외부 브라우저로 넘긴다', (url) => {
    expect(decideDocumentTarget(url)).toBe('external');
  });

  it.each([
    '',
    '   ',
    'not a url',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'intent://x#Intent;scheme=notion;end',
    'tel:010',
    'data:text/html,<b>x</b>',
  ])('TC-ONB-011 열 수 없는 값(%j)은 거부한다', (url) => {
    expect(decideDocumentTarget(url)).toBe('reject');
  });
});
