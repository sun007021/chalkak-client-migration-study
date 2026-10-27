import type { ComponentType } from 'react';
import { View } from 'react-native';

import type { TermsDocumentViewModel } from './TermsDocumentViewModel';

export type WebViewComponentProps = {
  url: string;
  onLoad: () => void;
  onError: () => void;
};

/** 플랫폼 웹뷰(react-native-webview 등)는 구현 단계에서 정한다. 화면은 인터페이스만 안다. */
export type LegalDocWebView = ComponentType<WebViewComponentProps>;

export type LegalDocSheetProps = {
  viewModel: TermsDocumentViewModel;
  WebView: LegalDocWebView;
  onClose: () => void;
};

export function LegalDocSheet(_props: LegalDocSheetProps) {
  return <View />;
}
