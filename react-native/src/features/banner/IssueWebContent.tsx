import { useRef } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

import type { IssueNavigationRequest } from './IssueNavigationPolicy';
import {
  ANDROID_LINK_SCRIPT,
  linkMessageToRequest,
  parseLinkMessage,
  toNavigationRequest,
  toNewWindowRequest,
  type Platform as BridgePlatform,
} from './issueWebBridge';

export type IssueWebContentProps = {
  url: string;
  /** 바뀔 때마다 같은 주소를 처음부터 다시 로드한다. */
  reloadKey: number;
  onLoadEnd: () => void;
  onLoadError: () => void;
  /** true면 웹뷰 안에서 이동을 허용한다(react-native-webview의 onShouldStartLoadWithRequest에 연결). */
  onShouldStartLoad: (request: IssueNavigationRequest) => boolean;
};

const PLATFORM: BridgePlatform = Platform.OS === 'ios' ? 'ios' : 'android';

/** reloadKey가 바뀌면 WebView를 새로 만들어 같은 주소를 처음부터 다시 로드한다(첫 요청 판정도 다시 시작). */
export function IssueWebContent(props: IssueWebContentProps) {
  return <IssueWebView key={props.reloadKey} {...props} />;
}

/**
 * react-native-webview 어댑터. 이동 판정은 순수 함수(issueWebBridge)와 ViewModel 정책이 하고, 여기서는 이벤트를 모아 넘기기만 한다.
 * - `originWhitelist={['*']}`: 기본값(http/https만)이면 그 밖의 스킴(tel:, intent:)을 라이브러리가 정책을 거치지 않고
 *   `Linking.openURL`로 직접 열어 버린다(REQ-BANR-017 위반). 모두 우리 핸들러로 보내 정책이 block하게 한다.
 * - `javaScriptCanOpenWindowsAutomatically={false}`: 사용자 제스처 없는 window.open은 플랫폼이 막는다.
 *   그래서 onOpenWindow로 오는 새 창은 제스처가 있는 것으로 본다.
 * - 사용자 제스처: iOS는 navigationType, Android는 주입 스크립트 메시지(issueWebBridge 참고).
 */
function IssueWebView({ url, onLoadEnd, onLoadError, onShouldStartLoad }: IssueWebContentProps) {
  const initialConsumed = useRef(false);
  const currentUrl = useRef<string | null>(null);

  return (
    <WebView
      source={{ uri: url }}
      originWhitelist={['*']}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows
      mixedContentMode="never"
      allowFileAccess={false}
      allowsLinkPreview={false}
      allowsBackForwardNavigationGestures={false}
      injectedJavaScriptBeforeContentLoaded={
        PLATFORM === 'android' ? ANDROID_LINK_SCRIPT : undefined
      }
      onShouldStartLoadWithRequest={(event) => {
        if (event.url === 'about:blank') return true;
        const request = toNavigationRequest(event, {
          platform: PLATFORM,
          initialConsumed: initialConsumed.current,
          currentUrl: currentUrl.current,
          sourceUrl: url,
        });
        initialConsumed.current = true;
        return onShouldStartLoad(request);
      }}
      onOpenWindow={(event) =>
        void onShouldStartLoad(toNewWindowRequest(event.nativeEvent.targetUrl, currentUrl.current))
      }
      onMessage={(event) => {
        const message = parseLinkMessage(event.nativeEvent.data);
        if (message) void onShouldStartLoad(linkMessageToRequest(message, currentUrl.current));
      }}
      onNavigationStateChange={(navigation) => {
        currentUrl.current = navigation.url;
      }}
      onLoad={() => onLoadEnd()}
      onError={() => onLoadError()}
      onHttpError={() => onLoadError()}
    />
  );
}
