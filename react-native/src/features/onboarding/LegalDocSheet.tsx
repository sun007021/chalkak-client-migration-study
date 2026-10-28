import type { ComponentType } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import type { TermsDocumentViewModel } from './TermsDocumentViewModel';

export type WebViewComponentProps = {
  url: string;
  onLoad: () => void;
  onError: () => void;
  /** 문서 안에서 허용 호스트가 아닌 곳으로 이동하려 할 때 그 URL(외부 브라우저로 연다). */
  onExternalLink: (url: string) => void;
};

/** 플랫폼 웹뷰(react-native-webview 등)는 구현 단계에서 정한다. 화면은 인터페이스만 안다. */
export type LegalDocWebView = ComponentType<WebViewComponentProps>;

export type LegalDocSheetProps = {
  viewModel: TermsDocumentViewModel;
  WebView: LegalDocWebView;
  onClose: () => void;
};

/** 약관 문서 시트(가입·설정 공용). testID는 testids.md의 legal-doc.*. */
export function LegalDocSheet({ viewModel, WebView, onClose }: LegalDocSheetProps) {
  const { status, inAppUrl, loadAttempt } = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  const title =
    viewModel.kind === 'service'
      ? t('onb.terms.doc.title.service')
      : t('onb.terms.doc.title.privacy');
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible onRequestClose={onClose}>
      <View testID="legal-doc.sheet" style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text testID="legal-doc.title" style={styles.title}>
            {title}
          </Text>
          <Pressable
            testID="legal-doc.close-button"
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
          >
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        {status === 'cannot-open' ? (
          <Text testID="legal-doc.open-failed-message" style={styles.message}>
            {t('onb.terms.doc.cannot-open')}
          </Text>
        ) : status === 'error' ? (
          <View style={styles.errorState}>
            <Text testID="legal-doc.error-state" style={styles.message}>
              {t('onb.terms.doc.error')}
            </Text>
            <Pressable
              testID="legal-doc.retry-button"
              accessibilityRole="button"
              onPress={() => viewModel.retry()}
              style={styles.retry}
            >
              <Text style={styles.retryText}>{t('onb.terms.doc.retry')}</Text>
            </Pressable>
          </View>
        ) : inAppUrl ? (
          <View testID="legal-doc.web-content" style={styles.web}>
            <WebView
              key={loadAttempt}
              url={inAppUrl}
              onLoad={() => viewModel.onWebViewLoaded()}
              onError={() => viewModel.onWebViewFailed()}
              onExternalLink={(target) => void viewModel.openExternal(target)}
            />
            {status === 'loading' ? (
              <ActivityIndicator testID="legal-doc.loading" style={styles.loading} />
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111111' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: '#111111' },
  web: { flex: 1 },
  loading: { ...StyleSheet.absoluteFill },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  message: { textAlign: 'center', marginTop: 48, fontSize: 15, color: '#444444' },
  retry: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
