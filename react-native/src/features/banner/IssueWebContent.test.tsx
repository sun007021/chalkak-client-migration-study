import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

import { IssueWebContent } from './IssueWebContent';
import type { IssueNavigationRequest } from './IssueNavigationPolicy';

const SOURCE = 'https://web.example.test/issues/1';
const lastProps = () =>
  (WebView as unknown as { lastProps: Record<string, (...args: unknown[]) => unknown> }).lastProps;

function setup() {
  const onLoadEnd = jest.fn();
  const onLoadError = jest.fn();
  const requests: IssueNavigationRequest[] = [];
  const onShouldStartLoad = jest.fn((request: IssueNavigationRequest) => {
    requests.push(request);
    return true;
  });
  const view = render(
    <IssueWebContent
      url={SOURCE}
      reloadKey={0}
      onLoadEnd={onLoadEnd}
      onLoadError={onLoadError}
      onShouldStartLoad={onShouldStartLoad}
    />,
  );
  return { view, onLoadEnd, onLoadError, onShouldStartLoad, requests };
}

describe('IssueWebContent 어댑터', () => {
  it('배너 주소를 로드하고 모든 스킴을 우리 핸들러로 보내도록 originWhitelist를 연다', async () => {
    await setup().view;
    const props = lastProps();
    expect(props.source).toEqual({ uri: SOURCE });
    expect(props.originWhitelist).toEqual(['*']);
    expect(props.javaScriptCanOpenWindowsAutomatically).toBe(false);
  });

  it('로드 완료·오류(네트워크·HTTP)를 콜백으로 넘긴다', async () => {
    const h = setup();
    await h.view;
    lastProps().onLoad();
    lastProps().onError();
    lastProps().onHttpError();
    expect(h.onLoadEnd).toHaveBeenCalledTimes(1);
    expect(h.onLoadError).toHaveBeenCalledTimes(2);
  });

  it('iOS: 첫 요청은 최초 로드, 이후 click 이동은 사용자 제스처로 정책에 넘기고 결과를 그대로 돌려준다', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const h = setup();
    await h.view;
    const first = lastProps().onShouldStartLoadWithRequest({
      url: SOURCE,
      navigationType: 'other',
      isTopFrame: true,
    });
    expect(first).toBe(true);
    lastProps().onShouldStartLoadWithRequest({
      url: 'https://elsewhere.test/',
      navigationType: 'click',
      isTopFrame: true,
    });
    expect(h.requests[0]).toMatchObject({ isInitialLoad: true, hasUserGesture: false });
    expect(h.requests[1]).toMatchObject({
      url: 'https://elsewhere.test/',
      isInitialLoad: false,
      hasUserGesture: true,
    });
  });

  it('about:blank는 정책을 거치지 않고 허용한다', async () => {
    const h = setup();
    await h.view;
    expect(
      lastProps().onShouldStartLoadWithRequest({
        url: 'about:blank',
        navigationType: 'other',
        isTopFrame: true,
      }),
    ).toBe(true);
    expect(h.onShouldStartLoad).not.toHaveBeenCalled();
  });

  it('새 창 요청은 새 창 + 제스처 있음으로 정책에 넘긴다', async () => {
    const h = setup();
    await h.view;
    lastProps().onOpenWindow({ nativeEvent: { targetUrl: 'https://elsewhere.test/b' } });
    expect(h.requests[0]).toMatchObject({
      url: 'https://elsewhere.test/b',
      opensNewWindow: true,
      hasUserGesture: true,
    });
  });

  it('주입 스크립트의 링크 메시지는 정책에 넘기고, 다른 메시지는 무시한다', async () => {
    const h = setup();
    await h.view;
    lastProps().onMessage({
      nativeEvent: {
        data: JSON.stringify({
          type: 'chalkak.link',
          url: 'https://elsewhere.test/',
          newWindow: false,
        }),
      },
    });
    lastProps().onMessage({ nativeEvent: { data: 'hello' } });
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]).toMatchObject({ url: 'https://elsewhere.test/', hasUserGesture: true });
  });

  it('reloadKey가 바뀌면 WebView를 새로 만들어 첫 요청 판정을 다시 시작한다', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const h = setup();
    const { rerender } = await h.view;
    lastProps().onShouldStartLoadWithRequest({
      url: SOURCE,
      navigationType: 'other',
      isTopFrame: true,
    });
    await rerender(
      <IssueWebContent
        url={SOURCE}
        reloadKey={1}
        onLoadEnd={h.onLoadEnd}
        onLoadError={h.onLoadError}
        onShouldStartLoad={h.onShouldStartLoad}
      />,
    );
    lastProps().onShouldStartLoadWithRequest({
      url: SOURCE,
      navigationType: 'other',
      isTopFrame: true,
    });
    expect(h.requests.map((r) => r.isInitialLoad)).toEqual([true, true]);
  });
});
