import { render } from '@testing-library/react-native';
import { WebView } from 'react-native-webview';

import { RnLegalDocWebView } from './RnLegalDocWebView';

const lastProps = () => (WebView as unknown as { lastProps: Record<string, any> }).lastProps;

describe('RnLegalDocWebView', () => {
  it('url을 source로 넘기고 로드 성공·실패·HTTP 오류를 콜백에 연결한다', async () => {
    const onLoad = jest.fn();
    const onError = jest.fn();
    await render(<RnLegalDocWebView url="https://notion.so/x" onLoad={onLoad} onError={onError} />);
    expect(lastProps().source).toEqual({ uri: 'https://notion.so/x' });
    lastProps().onLoad();
    expect(onLoad).toHaveBeenCalledTimes(1);
    lastProps().onError();
    lastProps().onHttpError();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('새 창을 열지 못하게 하고 https만 허용한다', async () => {
    await render(
      <RnLegalDocWebView url="https://notion.so/x" onLoad={jest.fn()} onError={jest.fn()} />,
    );
    expect(lastProps().setSupportMultipleWindows).toBe(false);
    expect(lastProps().originWhitelist).toEqual(['https://*']);
  });
});
