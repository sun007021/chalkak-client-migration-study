import shared from '../../../../shared/constants.json';
import { TERMS_ALLOWED_HOSTS, TERMS_URLS } from '../../constants';
import { FakeExternalLinkOpener } from '../../test/FakeExternalLinkOpener';
import { LegalDocumentLauncher, isAllowedLegalDocumentUrl } from './LegalDocument';

describe('약관 문서 URL 허용 판정', () => {
  it.each([
    'https://www.notion.so/chalkak/terms-abc',
    'https://x.notion.site/privacy-123',
    'https://notion.com/terms',
    'https://app.notion.com/p/3c66b8e8e3678064b543c26b5c0f932d?source=copy_link',
    'https://deep.sub.notion.site/a',
    'HTTPS://WWW.NOTION.SO/Page',
  ])('TC-ONB-010 허용: %s', (url) => {
    expect(isAllowedLegalDocumentUrl(url)).toBe(true);
  });

  it.each([
    ['http(비 https)', 'http://notion.so/page'],
    ['접미 속임(도메인 경계)', 'https://notion.com.evil.example/page'],
    ['경로에만 notion.so', 'https://evil.example/notion.so'],
    ['앞에 문자가 붙은 호스트', 'https://evilnotion.so/page'],
    ['허용 호스트가 하위 도메인 자리', 'https://notion.so.evil.example/page'],
    ['userinfo가 허용 호스트처럼 보임', 'https://notion.so@evil.example/page'],
    ['userinfo가 섞임', 'https://user:pw@notion.so/page'],
    ['빈 문자열', ''],
    ['공백만', '   '],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,hi'],
    ['ftp scheme', 'ftp://notion.so/x'],
    ['스킴 없음', 'notion.so/page'],
    ['스킴 상대 URL', '//notion.so/page'],
    ['허용 목록 밖 호스트', 'https://example.com/terms'],
  ])('TC-ONB-011 거절: %s', (_name, url) => {
    expect(isAllowedLegalDocumentUrl(url)).toBe(false);
  });

  it('TC-ONB-009 공통 상수 URL은 shared/constants.json과 같고 모두 허용 호스트다', () => {
    expect(TERMS_URLS.service).toBe(shared.TERMS_URLS.service);
    expect(TERMS_URLS.privacy).toBe(shared.TERMS_URLS.privacy);
    expect([...TERMS_ALLOWED_HOSTS]).toEqual(shared.TERMS_ALLOWED_HOSTS);
    expect(isAllowedLegalDocumentUrl(TERMS_URLS.service)).toBe(true);
    expect(isAllowedLegalDocumentUrl(TERMS_URLS.privacy)).toBe(true);
  });
});

describe('LegalDocumentLauncher', () => {
  it('TC-ONB-008 TC-ONB-009 서비스 이용약관·개인정보 처리방침을 각각 공통 상수 URL로 연다', () => {
    const opener = new FakeExternalLinkOpener();
    const launcher = new LegalDocumentLauncher({ opener });
    expect(launcher.open('service')).toBe('opened');
    expect(launcher.open('privacy')).toBe('opened');
    expect(opener.opened).toEqual([TERMS_URLS.service, TERMS_URLS.privacy]);
  });

  it('TC-ONB-013 브라우저가 열지 못하면 failed다(팝업 차단)', () => {
    const opener = new FakeExternalLinkOpener();
    opener.result = false;
    expect(new LegalDocumentLauncher({ opener }).open('service')).toBe('failed');
  });

  it('TC-ONB-013 opener가 던져도 failed이고 밖으로 던지지 않는다', () => {
    const opener = new FakeExternalLinkOpener();
    opener.result = 'throw';
    expect(new LegalDocumentLauncher({ opener }).open('privacy')).toBe('failed');
  });
});
