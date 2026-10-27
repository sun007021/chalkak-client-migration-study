import { FakeAnalyticsTracker } from '../../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeExternalLinkOpener } from '../../core/link/__testing__/FakeExternalLinkOpener';
import { TERMS_URLS } from '../../shared/constants';
import { TermsDocumentViewModel } from './TermsDocumentViewModel';
import type { TermsKind } from './TermsViewModel';

function setup(
  kind: TermsKind,
  url: string = kind === 'service' ? TERMS_URLS.service : TERMS_URLS.privacy,
) {
  const analytics = new FakeAnalyticsTracker();
  const opener = new FakeExternalLinkOpener();
  const vm = new TermsDocumentViewModel({ kind, url, analytics, externalLinkOpener: opener });
  return { vm, analytics, opener };
}

describe('TermsDocumentViewModel', () => {
  it('TC-ONB-049 start는 서비스 약관이면 screen_view terms_of_service, 개인정보면 privacy_policy를 한 번 보낸다', async () => {
    const service = setup('service');
    await service.vm.start();
    expect(service.analytics.screenNames).toEqual(['terms_of_service']);
    const privacy = setup('privacy');
    await privacy.vm.start();
    expect(privacy.analytics.screenNames).toEqual(['privacy_policy']);
  });

  it('TC-ONB-008 공통 상수 URL은 앱 안 웹뷰로 열고 외부 브라우저는 부르지 않는다', async () => {
    const { vm, opener } = setup('service');
    await vm.start();
    expect(vm.getSnapshot()).toMatchObject({ status: 'loading', inAppUrl: TERMS_URLS.service });
    expect(opener.opened).toEqual([]);
  });

  it('TC-ONB-011 허용 호스트가 아니면 앱 안에서 열지 않고 외부 브라우저로 연다', async () => {
    const { vm, opener } = setup('service', 'https://evil.example/terms');
    await vm.start();
    expect(vm.getSnapshot().inAppUrl).toBeNull();
    expect(opener.opened).toEqual(['https://evil.example/terms']);
  });

  it('TC-ONB-013 외부 브라우저로도 열 수 없으면 cannot-open("문서를 열 수 없어요")', async () => {
    const { vm, opener } = setup('service', 'https://evil.example/terms');
    opener.setResult(false);
    await vm.start();
    expect(vm.getSnapshot().status).toBe('cannot-open');
  });

  it('TC-ONB-013 거부되는 URL(빈 값, javascript:)은 외부로도 열지 않고 cannot-open', async () => {
    for (const url of ['', 'javascript:alert(1)']) {
      const { vm, opener } = setup('privacy', url);
      await vm.start();
      expect(vm.getSnapshot().status).toBe('cannot-open');
      expect(opener.opened).toEqual([]);
    }
  });

  it('TC-ONB-012 웹뷰 로드 성공이면 loaded, 실패면 error, 다시 시도하면 loading으로 돌아가고 시도 횟수가 늘어 웹뷰가 다시 로드된다', async () => {
    const { vm } = setup('service');
    await vm.start();
    vm.onWebViewFailed();
    expect(vm.getSnapshot().status).toBe('error');
    const before = vm.getSnapshot().loadAttempt;
    vm.retry();
    expect(vm.getSnapshot()).toMatchObject({ status: 'loading', loadAttempt: before + 1 });
    vm.onWebViewLoaded();
    expect(vm.getSnapshot().status).toBe('loaded');
  });

  it('TC-ONB-012 다시 시도는 오류 상태에서만 동작한다', async () => {
    const { vm } = setup('service');
    await vm.start();
    vm.onWebViewLoaded();
    vm.retry();
    expect(vm.getSnapshot()).toMatchObject({ status: 'loaded', loadAttempt: 0 });
  });
});
