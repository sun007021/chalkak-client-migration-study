import { WebView } from 'react-native-webview';

import type { WebViewComponentProps } from './LegalDocSheet';
import { decideDocumentTarget } from './TermsDocumentPolicy';

/**
 * react-native-webview 어댑터. HTTP 오류 응답(4xx/5xx)도 로드 실패로 본다.
 * 최상위 이동은 문서 URL과 같은 정책(decideDocumentTarget)으로 다시 판정한다: 앱 안 허용 호스트가 아니면
 * 웹뷰에서 막고(false) 외부 브라우저로 넘긴다. 하위 프레임 로드는 건드리지 않는다.
 */
export function RnLegalDocWebView({ url, onLoad, onError, onExternalLink }: WebViewComponentProps) {
  const shouldStart = (request: { url: string; isTopFrame?: boolean }): boolean => {
    if (request.isTopFrame === false) return true;
    const target = decideDocumentTarget(request.url);
    if (target === 'in-app') return true;
    if (target === 'external') onExternalLink(request.url);
    return false;
  };
  return (
    <WebView
      source={{ uri: url }}
      onLoad={onLoad}
      onError={onError}
      onHttpError={onError}
      onShouldStartLoadWithRequest={shouldStart}
      originWhitelist={['https://*']}
      setSupportMultipleWindows={false}
      style={{ flex: 1 }}
    />
  );
}
