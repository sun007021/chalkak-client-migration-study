import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, spacing, typography } from '../../shared/design/tokens';
import type { NotificationDetailViewModel } from './NotificationDetailViewModel';
import { BackButton } from '../../shared/ui/BackButton';
import { ChalkakOutlinedButton } from '../../shared/ui/Button';
import { RemoteImage } from '../../shared/ui/RemoteImage';
import { Text } from '../../shared/ui/Text';

/** 알림 상세 화면. testID는 docs/testing/testids.md의 알림 상세 표를 따른다. 마운트 = onShown, 언마운트 = onHidden. */
export function NotificationDetailScreen({
  viewModel,
}: {
  viewModel: NotificationDetailViewModel;
}) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  const { detail } = state;
  return (
    <View testID="notification-detail.root" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.barBack}>
          <BackButton
            testID="notification-detail.back-button"
            accessibilityLabel={t('common.close')}
            onPress={() => viewModel.onBackPress()}
          />
        </View>
        <Text
          testID="notification-detail.screen-title"
          style={styles.screenTitle}
          accessibilityRole="header"
        >
          {t('noti.detail.title')}
        </Text>
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator testID="notification-detail.loading" color={colors.actionPrimary} />
        </View>
      ) : null}
      {state.status === 'not-found' ? (
        <View style={styles.center}>
          <Text testID="notification-detail.not-found-state" style={styles.notFound}>
            {t('noti.gone')}
          </Text>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View testID="notification-detail.error-state" style={styles.center}>
          <Text style={styles.message}>{state.errorMessage ?? t('noti.detail.error')}</Text>
          <ChalkakOutlinedButton
            testID="notification-detail.retry-button"
            label={t('noti.inbox.retry')}
            fillsWidth={false}
            onPress={() => void viewModel.retry()}
            style={styles.retry}
          />
        </View>
      ) : null}

      {detail ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: spacing.screenHorizontal,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
            gap: spacing.xl,
          }}
        >
          <View>
            <Text testID="notification-detail.title" style={styles.title}>
              {detail.title}
            </Text>
            <Text testID="notification-detail.body" style={styles.body}>
              {detail.body}
            </Text>
          </View>
          {detail.photoUrl ? (
            <RemoteImage
              testID="notification-detail.photo"
              uri={detail.photoUrl}
              resizeMode="contain"
              accessibilityLabel="반려된 내 사진"
              style={styles.photo}
            />
          ) : null}
          {detail.rejectionReason ? (
            <View testID="notification-detail.rejection-section">
              <Text style={styles.sectionTitle}>{t('noti.detail.reason')}</Text>
              <Text testID="notification-detail.rejection-reason" style={styles.reason}>
                {detail.rejectionReason}
              </Text>
            </View>
          ) : null}
          {detail.showBackToInbox ? (
            <ChalkakOutlinedButton
              testID="notification-detail.back-to-inbox-button"
              label={t('noti.detail.to-inbox')}
              onPress={() => viewModel.onBackToInboxPress()}
            />
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

// 원본 근거: docs/design/screens-c.md §3.2 (제목 headline, 본문 subheadline textSecondary, 사진 1:1 surface, 사유 라벨 caption textInactive).
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { height: 72, justifyContent: 'center', paddingHorizontal: 20 },
  barBack: { position: 'absolute', left: 20 },
  screenTitle: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  notFound: { ...typography.subheadline, color: colors.textSecondary, textAlign: 'center' },
  title: { ...typography.headline, color: colors.textPrimary },
  body: { ...typography.subheadline, color: colors.textSecondary, marginTop: spacing.sm },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: colors.surface },
  sectionTitle: { ...typography.caption, color: colors.textInactive },
  reason: { ...typography.body, color: colors.textPrimary, marginTop: spacing.sm },
  retry: { marginTop: spacing.lg },
});
