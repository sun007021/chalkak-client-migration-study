import { WebView } from 'react-native-webview';

import type { WebViewComponentProps } from './LegalDocSheet';

/** react-native-webview 어댑터. HTTP 오류 응답(4xx/5xx)도 로드 실패로 본다. */
export function RnLegalDocWebView({ url, onLoad, onError }: WebViewComponentProps) {
  return (
    <WebView
      source={{ uri: url }}
      onLoad={onLoad}
      onError={onError}
      onHttpError={onError}
      originWhitelist={['https://*']}
      setSupportMultipleWindows={false}
      style={{ flex: 1 }}
    />
  );
}
