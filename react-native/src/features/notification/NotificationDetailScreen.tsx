import { useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import type { NotificationDetailViewModel } from './NotificationDetailViewModel';

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
        <Pressable
          testID="notification-detail.back-button"
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => viewModel.onBackPress()}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text testID="notification-detail.screen-title" style={styles.screenTitle}>
          {t('noti.detail.title')}
        </Text>
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator testID="notification-detail.loading" style={styles.center} />
      ) : null}
      {state.status === 'not-found' ? (
        <View style={styles.center}>
          <Text testID="notification-detail.not-found-state" style={styles.message}>
            {t('noti.gone')}
          </Text>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View testID="notification-detail.error-state" style={styles.center}>
          <Text style={styles.message}>{state.errorMessage ?? t('noti.detail.error')}</Text>
          <Pressable
            testID="notification-detail.retry-button"
            accessibilityRole="button"
            onPress={() => void viewModel.retry()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>{t('noti.inbox.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {detail ? (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
        >
          <Text testID="notification-detail.title" style={styles.title}>
            {detail.title}
          </Text>
          <Text testID="notification-detail.body" style={styles.body}>
            {detail.body}
          </Text>
          {detail.photoUrl ? (
            <Image
              testID="notification-detail.photo"
              source={{ uri: detail.photoUrl }}
              style={styles.photo}
              resizeMode="contain"
            />
          ) : null}
          {detail.rejectionReason ? (
            <View testID="notification-detail.rejection-section" style={styles.section}>
              <Text style={styles.sectionTitle}>{t('noti.detail.reason')}</Text>
              <Text testID="notification-detail.rejection-reason" style={styles.body}>
                {detail.rejectionReason}
              </Text>
            </View>
          ) : null}
          {detail.showBackToInbox ? (
            <Pressable
              testID="notification-detail.back-to-inbox-button"
              accessibilityRole="button"
              onPress={() => viewModel.onBackToInboxPress()}
              style={styles.retry}
            >
              <Text style={styles.retryText}>{t('noti.detail.to-inbox')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  back: { paddingRight: spacing.md },
  backText: { fontSize: 20, color: colors.textPrimary },
  screenTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  message: { fontSize: 15, color: colors.textPrimary, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  body: { fontSize: 15, color: colors.textPrimary, marginTop: spacing.md, lineHeight: 22 },
  photo: { width: '100%', aspectRatio: 1, marginTop: spacing.lg, backgroundColor: colors.surface },
  section: { marginTop: spacing.xl },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  retry: {
    marginTop: spacing.xl,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  retryText: { fontSize: 14, color: colors.textPrimary },
});
