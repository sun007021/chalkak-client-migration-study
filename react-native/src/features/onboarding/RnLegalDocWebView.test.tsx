import { render } from '@testing-library/react-native';
import { WebView } from 'react-native-webview';

import { RnLegalDocWebView } from './RnLegalDocWebView';

const lastProps = () => (WebView as unknown as { lastProps: Record<string, any> }).lastProps;

describe('RnLegalDocWebView', () => {
  it('url을 source로 넘기고 로드 성공·실패·HTTP 오류를 콜백에 연결한다', async () => {
    const onLoad = jest.fn();
    const onError = jest.fn();
    await render(
      <RnLegalDocWebView
        url="https://notion.so/x"
        onLoad={onLoad}
        onError={onError}
        onExternalLink={jest.fn()}
      />,
    );
    expect(lastProps().source).toEqual({ uri: 'https://notion.so/x' });
    lastProps().onLoad();
    expect(onLoad).toHaveBeenCalledTimes(1);
    lastProps().onError();
    lastProps().onHttpError();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('새 창을 열지 못하게 하고 https만 허용한다', async () => {
    await render(
      <RnLegalDocWebView
        url="https://notion.so/x"
        onLoad={jest.fn()}
        onError={jest.fn()}
        onExternalLink={jest.fn()}
      />,
    );
    expect(lastProps().setSupportMultipleWindows).toBe(false);
    expect(lastProps().originWhitelist).toEqual(['https://*']);
  });

  describe('onShouldStartLoadWithRequest', () => {
    async function setup() {
      const onExternalLink = jest.fn();
      await render(
        <RnLegalDocWebView
          url="https://notion.so/x"
          onLoad={jest.fn()}
          onError={jest.fn()}
          onExternalLink={onExternalLink}
        />,
      );
      const decide = (url: string, isTopFrame = true) =>
        lastProps().onShouldStartLoadWithRequest({ url, isTopFrame });
      return { decide, onExternalLink };
    }

    it('허용 호스트 이동은 웹뷰에서 계속한다', async () => {
      const { decide, onExternalLink } = await setup();
      expect(decide('https://www.notion.so/other')).toBe(true);
      expect(onExternalLink).not.toHaveBeenCalled();
    });

    it('허용 호스트가 아니면 웹뷰에서 막고 외부로 넘긴다', async () => {
      const { decide, onExternalLink } = await setup();
      expect(decide('https://evil.example/x')).toBe(false);
      expect(onExternalLink).toHaveBeenCalledWith('https://evil.example/x');
    });

    it('해석할 수 없는 값(javascript:, 백슬래시)은 막고 열지도 않는다', async () => {
      const { decide, onExternalLink } = await setup();
      expect(decide('javascript:alert(1)')).toBe(false);
      expect(decide('https://notion.so\\@evil.example')).toBe(false);
      expect(onExternalLink).not.toHaveBeenCalled();
    });

    it('하위 프레임 로드는 판정하지 않는다', async () => {
      const { decide } = await setup();
      expect(decide('https://cdn.example/frame', false)).toBe(true);
    });
  });
});
