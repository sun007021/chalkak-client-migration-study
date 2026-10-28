import { useEffect } from 'react';
import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FakeAnalyticsTracker } from '../../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeExternalLinkOpener } from '../../core/linking/__testing__/FakeExternalLinkOpener';
import { TERMS_URLS } from '../../shared/constants';
import { t } from '../../shared/copy';
import { LegalDocSheet, type WebViewComponentProps } from './LegalDocSheet';
import { TermsDocumentViewModel } from './TermsDocumentViewModel';

/** 웹뷰 Fake: 마운트 기록을 남기고 테스트가 onLoad/onError를 직접 부른다. */
function createFakeWebView() {
  const mounts: WebViewComponentProps[] = [];
  function FakeWebView(props: WebViewComponentProps) {
    useEffect(() => {
      mounts.push(props);
    }, [props]);
    return <View testID="fake-webview" accessibilityValue={{ text: props.url }} />;
  }
  return { FakeWebView, mounts };
}

async function setup(url: string = TERMS_URLS.service) {
  const vm = new TermsDocumentViewModel({
    kind: 'service',
    url,
    analytics: new FakeAnalyticsTracker(),
    linkOpener: new FakeExternalLinkOpener(),
  });
  await vm.start();
  const onClose = jest.fn();
  const web = createFakeWebView();
  await render(<LegalDocSheet viewModel={vm} WebView={web.FakeWebView} onClose={onClose} />);
  return { vm, onClose, ...web };
}

describe('LegalDocSheet', () => {
  it('TC-ONB-008 시트에 제목과 웹뷰 본문이 보이고 서비스 약관 URL을 불러온다', async () => {
    const { mounts } = await setup();
    expect(screen.getByTestId('legal-doc.sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('legal-doc.title')).toHaveTextContent(
      t('onb.terms.doc.title.service'),
    );
    expect(screen.getByTestId('legal-doc.web-content')).toBeOnTheScreen();
    expect(mounts.at(-1)?.url).toBe(TERMS_URLS.service);
    expect(screen.getByTestId('legal-doc.loading')).toBeOnTheScreen();
  });

  it('TC-ONB-012 로드 실패 시 "문서를 불러오지 못했어요"와 "다시 시도"가 보이고 다시 시도가 재로딩한다', async () => {
    const { mounts, vm } = await setup();
    mounts.at(-1)!.onError();
    expect(await screen.findByTestId('legal-doc.error-state')).toHaveTextContent(
      t('onb.terms.doc.error'),
    );
    expect(screen.getByTestId('legal-doc.retry-button')).toHaveTextContent(
      t('onb.terms.doc.retry'),
    );
    const mountsBefore = mounts.length;
    await fireEvent.press(screen.getByTestId('legal-doc.retry-button'));
    expect(vm.getSnapshot().status).toBe('loading');
    expect(await screen.findByTestId('legal-doc.web-content')).toBeOnTheScreen();
    expect(mounts.length).toBeGreaterThan(mountsBefore); // 웹뷰가 다시 마운트/로드됐다
  });

  it('TC-ONB-012 로드가 끝나면 로딩 표시가 사라진다', async () => {
    const { mounts } = await setup();
    mounts.at(-1)!.onLoad();
    await screen.findByTestId('legal-doc.web-content');
    expect(screen.queryByTestId('legal-doc.loading')).not.toBeOnTheScreen();
  });

  it('TC-ONB-013 열 수 없는 URL이면 "문서를 열 수 없어요"를 보이고 웹뷰는 없다', async () => {
    await setup('javascript:alert(1)');
    expect(screen.getByTestId('legal-doc.open-failed-message')).toHaveTextContent(
      t('onb.terms.doc.cannot-open'),
    );
    expect(screen.queryByTestId('legal-doc.web-content')).not.toBeOnTheScreen();
  });

  it('TC-ONB-014 닫기 버튼이 onClose를 부른다(약관 체크 상태는 소유자가 유지한다)', async () => {
    const { onClose } = await setup();
    await fireEvent.press(screen.getByTestId('legal-doc.close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
