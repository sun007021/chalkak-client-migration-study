import { useEffect, type ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import { IssueWebContent, type IssueWebContentProps } from './IssueWebContent';
import type { IssueWebViewModel } from './IssueWebViewModel';

export type IssueWebScreenProps = {
  viewModel: IssueWebViewModel;
  onBack: () => void;
  /** 기본은 react-native-webview 어댑터. 테스트가 바꿔 끼운다. */
  WebContent?: ComponentType<IssueWebContentProps>;
};

/** testID는 docs/testing/testids.md의 issue.* 그대로. 제목은 항상 home.banner.title("ISSUE"). */
export function IssueWebScreen({
  viewModel,
  onBack,
  WebContent = IssueWebContent,
}: IssueWebScreenProps) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();

  // screen_view는 한 번만 나가도록 ViewModel이 막는다(StrictMode의 effect 이중 실행에도 안전).
  useEffect(() => viewModel.onScreenShown(), [viewModel]);

  return (
    <View testID="issue.root" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          testID="issue.back-button"
          accessibilityRole="button"
          onPress={onBack}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text testID="issue.title" style={styles.title}>
          {t('home.banner.title')}
        </Text>
      </View>
      <View style={styles.body}>
        {state.errorKind === 'link-unavailable' ? (
          <Text testID="issue.link-open-failed-message" style={styles.message}>
            {t('banner.link-invalid')}
          </Text>
        ) : null}
        {state.errorKind === 'load-failed' ? (
          <View style={styles.center}>
            <Text testID="issue.error-state" style={styles.message}>
              {t('banner.web.load-error')}
            </Text>
            <Pressable
              testID="issue.retry-button"
              accessibilityRole="button"
              onPress={() => viewModel.retry()}
              style={styles.retry}
            >
              <Text style={styles.retryText}>{t('banner.web.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
        {state.sourceUrl !== null && state.errorKind === null ? (
          <View testID="issue.web-content" style={styles.fill}>
            <WebContent
              url={state.sourceUrl}
              reloadKey={state.loadAttempt}
              onLoadEnd={() => viewModel.onLoadEnd()}
              onLoadError={() => viewModel.onLoadError()}
              onShouldStartLoad={(request) =>
                viewModel.onNavigationRequest(request) === 'allow-in-app'
              }
            />
            {state.phase === 'loading' ? (
              <ActivityIndicator testID="issue.loading" style={styles.loading} />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: colors.textPrimary },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { flex: 1 },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  message: { padding: spacing.lg, textAlign: 'center', color: colors.textSecondary },
  retry: { paddingVertical: spacing.sm },
  retryText: { color: colors.accent, fontWeight: '600' },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
