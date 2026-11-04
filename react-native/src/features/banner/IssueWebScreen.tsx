import { useEffect, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, spacing, typography } from '../../shared/design/tokens';
import { BackButton } from '../../shared/ui/BackButton';
import { ChalkakOutlinedButton } from '../../shared/ui/Button';
import { IssueWebContent, type IssueWebContentProps } from './IssueWebContent';
import type { IssueWebViewModel } from './IssueWebViewModel';
import { Text } from '../../shared/ui/Text';

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
        <View style={styles.barBack}>
          <BackButton testID="issue.back-button" onPress={onBack} />
        </View>
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
            <ChalkakOutlinedButton
              testID="issue.retry-button"
              label={t('banner.web.retry')}
              fillsWidth={false}
              onPress={() => viewModel.retry()}
            />
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
              <ActivityIndicator
                testID="issue.loading"
                color={colors.actionPrimary}
                style={styles.loading}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { height: 72, justifyContent: 'center', paddingHorizontal: 20 },
  barBack: { position: 'absolute', left: 20 },
  title: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  body: { flex: 1 },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  message: {
    ...typography.body,
    padding: spacing.lg,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
