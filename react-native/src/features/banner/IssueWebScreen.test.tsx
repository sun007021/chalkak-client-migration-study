import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { t } from '../../shared/copy';
import type { IssueWebContentProps } from './IssueWebContent';
import { IssueWebScreen } from './IssueWebScreen';
import { createIssueWebHarness, SAFE_URL } from './__testing__/createIssueWebHarness';

/** react-native-webview 대신 prop을 붙잡아 두는 가짜. 테스트가 콜백을 직접 호출한다. */
function createFakeWebContent() {
  const control: { props: IssueWebContentProps | null; mounts: number } = {
    props: null,
    mounts: 0,
  };
  function FakeWebContent(props: IssueWebContentProps) {
    control.props = props;
    return <View />;
  }
  return { control, FakeWebContent };
}

async function renderScreen(url: string = SAFE_URL) {
  const h = createIssueWebHarness(url);
  const web = createFakeWebContent();
  const onBack = jest.fn();
  await render(
    <IssueWebScreen viewModel={h.viewModel} onBack={onBack} WebContent={web.FakeWebContent} />,
  );
  return { h, web, onBack };
}

describe('IssueWebScreen', () => {
  it('REQ-BANR-012 제목은 항상 "ISSUE"이고 화면이 보이면 screen_view issue를 한 번 보낸다', async () => {
    const { h } = await renderScreen();
    expect(screen.getByTestId('issue.root')).toBeOnTheScreen();
    expect(screen.getByTestId('issue.title')).toHaveTextContent(t('home.banner.title'));
    expect(h.analytics.screenNames).toEqual(['issue']);
  });

  it('TC-BANR-027 웹뷰 본문은 배너 주소를 로드하고 로딩 표시가 보인다', async () => {
    const { web } = await renderScreen();
    expect(screen.getByTestId('issue.web-content')).toBeOnTheScreen();
    expect(web.control.props?.url).toBe(SAFE_URL);
    expect(screen.getByTestId('issue.loading')).toBeOnTheScreen();
    expect(screen.queryByTestId('issue.error-state')).not.toBeOnTheScreen();
  });

  it('로드가 끝나면 로딩 표시가 사라진다', async () => {
    const { web } = await renderScreen();
    await act(async () => web.control.props?.onLoadEnd());
    expect(screen.queryByTestId('issue.loading')).not.toBeOnTheScreen();
    expect(screen.getByTestId('issue.web-content')).toBeOnTheScreen();
  });

  it('뒤로 버튼을 누르면 onBack이 불린다', async () => {
    const { onBack } = await renderScreen();
    await fireEvent.press(screen.getByTestId('issue.back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('TC-BANR-024 REQ-BANR-019 로드 실패면 "페이지를 불러오지 못했어요" + 다시 시도, 누르면 같은 주소를 다시 로드한다', async () => {
    const { web } = await renderScreen();
    await act(async () => web.control.props?.onLoadError());
    expect(screen.getByTestId('issue.error-state')).toHaveTextContent(t('banner.web.load-error'));
    expect(screen.getByTestId('issue.retry-button')).toHaveTextContent(t('banner.web.retry'));
    expect(screen.queryByTestId('issue.web-content')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('issue.retry-button'));
    expect(screen.queryByTestId('issue.error-state')).not.toBeOnTheScreen();
    expect(web.control.props?.url).toBe(SAFE_URL);
    expect(web.control.props?.reloadKey).toBe(1);
    expect(screen.getByTestId('issue.loading')).toBeOnTheScreen();

    await act(async () => web.control.props?.onLoadEnd());
    expect(screen.queryByTestId('issue.loading')).not.toBeOnTheScreen();
  });

  it('REQ-BANR-013 https가 아닌 주소는 웹뷰를 만들지 않고 "링크를 열 수 없어요"를 보인다', async () => {
    const { web } = await renderScreen('http://web.example.test/issues/1');
    expect(web.control.props).toBeNull();
    expect(screen.queryByTestId('issue.web-content')).not.toBeOnTheScreen();
    expect(screen.getByTestId('issue.link-open-failed-message')).toHaveTextContent(
      t('banner.link-invalid'),
    );
  });

  it('TC-BANR-019 TC-BANR-023 웹뷰의 이동 요청이 정책에 따라 처리된다(링크 → 외부 브라우저, 앱 안 이동 거부)', async () => {
    const { h, web } = await renderScreen();
    let allowed = true;
    await act(async () => {
      allowed =
        web.control.props?.onShouldStartLoad({
          url: 'https://other.example.test/x',
          isInitialLoad: false,
          isMainFrame: true,
          hasUserGesture: true,
          opensNewWindow: false,
          currentUrl: SAFE_URL,
        }) ?? true;
    });
    expect(allowed).toBe(false);
    expect(h.linkOpener.opened).toEqual(['https://other.example.test/x']);
  });

  it('TC-BANR-017 웹뷰의 최초 로드 요청(배너 주소)은 앱 안에서 허용된다', async () => {
    const { web } = await renderScreen();
    expect(
      web.control.props?.onShouldStartLoad({
        url: SAFE_URL,
        isInitialLoad: true,
        isMainFrame: true,
        hasUserGesture: false,
        opensNewWindow: false,
        currentUrl: null,
      }),
    ).toBe(true);
  });
});
