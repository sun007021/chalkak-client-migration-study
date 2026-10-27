import { getRandomBytes } from 'expo-crypto';
import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

import type { IssueNavigationRequest } from './IssueNavigationPolicy';
import {
  createLinkScript,
  isSameOrigin,
  linkMessageToRequest,
  parseLinkMessage,
  toNavigationRequest,
  toNewWindowRequest,
  type BridgePlatform,
} from './issueWebBridge';

export type IssueWebContentProps = {
  url: string;
  /** 바뀔 때마다 같은 주소를 처음부터 다시 로드한다. */
  reloadKey: number;
  onLoadEnd: () => void;
  onLoadError: () => void;
  /** true면 웹뷰 안에서 이동을 허용한다(react-native-webview의 onShouldStartLoadWithRequest에 연결). */
  onShouldStartLoad: (request: IssueNavigationRequest) => boolean;
  /** 웹뷰 마운트마다 한 번 부르는 nonce 생성기(테스트용). 기본은 expo-crypto 난수. */
  createNonce?: () => string;
};

const randomNonce = (): string =>
  Array.from(getRandomBytes(16), (byte) => byte.toString(16).padStart(2, '0')).join('');

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
function IssueWebView({
  url,
  onLoadEnd,
  onLoadError,
  onShouldStartLoad,
  createNonce = randomNonce,
}: IssueWebContentProps) {
  const platform: BridgePlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  // 마운트마다(재시도 포함) 새 nonce. 주입 스크립트의 클로저와 onMessage 검증에만 쓰인다.
  const [nonce] = useState(createNonce);
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
        platform === 'android' ? createLinkScript(nonce) : undefined
      }
      onShouldStartLoadWithRequest={(event) => {
        // iframe 내부 문서(about:blank, about:srcdoc)는 정책 대상이 아니다. 비 http(s) 스킴 차단이 이 문서들까지 막지 않게 한다.
        if (event.url.startsWith('about:')) return true;
        const request = toNavigationRequest(event, {
          platform,
          initialConsumed: initialConsumed.current,
          currentUrl: currentUrl.current,
          sourceUrl: url,
        });
        // 하위 프레임 요청이 먼저 와도 최초 로드(최상위)를 가리지 않도록 최상위 요청만 소비한다.
        if (event.isTopFrame) initialConsumed.current = true;
        return onShouldStartLoad(request);
      }}
      onOpenWindow={(event) =>
        void onShouldStartLoad(toNewWindowRequest(event.nativeEvent.targetUrl, currentUrl.current))
      }
      onMessage={(event) => {
        // 보낸 문서가 지금 보고 있는 최상위 문서와 같은 origin이어야 한다(iframe·이전 문서의 메시지 차단).
        if (!isSameOrigin(event.nativeEvent.url ?? '', currentUrl.current ?? url)) return;
        const message = parseLinkMessage(event.nativeEvent.data, nonce);
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
