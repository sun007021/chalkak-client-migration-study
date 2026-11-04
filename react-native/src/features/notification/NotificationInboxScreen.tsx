import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import type {
  NotificationInboxViewModel,
  NotificationItemView,
} from './NotificationInboxViewModel';
import { BackButton } from '../../shared/ui/BackButton';
import { Icon } from '../../shared/ui/icons/Icon';
import { RemoteImage } from '../../shared/ui/RemoteImage';
import { RoundIconButton } from '../../shared/ui/RoundIconButton';
import { Text } from '../../shared/ui/Text';

type Props = { viewModel: NotificationInboxViewModel; onBack?: () => void };

/**
 * 알림함 화면. testID는 docs/testing/testids.md의 알림함 표를 따른다.
 * 마운트 = onShown, 언마운트 = onHidden. ViewModel을 만들고 버리는 것은 소유자(라우트)다.
 */
export function NotificationInboxScreen({ viewModel, onBack }: Props) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  // 화면에 보이는 가장 아래 행의 인덱스를 ViewModel에 알린다(다음 페이지 요청 판단은 ViewModel이 한다).
  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
      const last = viewableItems.reduce((max, v) => Math.max(max, v.index ?? -1), -1);
      if (last >= 0) void viewModel.onLastVisibleIndexChanged(last);
    },
    [viewModel],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationItemView }) => (
      <Row item={item} onPress={() => void viewModel.onItemPressed(item.id)} />
    ),
    [viewModel],
  );

  return (
    <View testID="notifications.root" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.barBack}>
          <BackButton
            testID="notifications.back-button"
            accessibilityLabel={t('common.close')}
            onPress={() => onBack?.()}
          />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t('noti.inbox.title')}
        </Text>
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator
            testID="notifications.loading"
            color={colors.actionPrimary}
            style={styles.spinner}
          />
          <Text style={styles.loadingText}>{t('noti.inbox.loading')}</Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View testID="notifications.error-state" style={[styles.center, styles.errorBox]}>
          <Text style={styles.message}>{state.errorMessage ?? t('noti.inbox.error')}</Text>
          <RoundIconButton
            testID="notifications.retry-button"
            accessibilityLabel={t('noti.inbox.retry')}
            size={48}
            iconSize={20}
            onPress={() => void viewModel.retry()}
          />
        </View>
      ) : null}

      {state.status === 'ready' || state.status === 'empty' ? (
        <FlatList
          testID="notifications.list"
          data={state.items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onViewableItemsChanged={onViewable}
          refreshControl={
            <RefreshControl
              tintColor={colors.actionPrimary}
              colors={[colors.actionPrimary]}
              refreshing={state.refreshing}
              onRefresh={() => void viewModel.refresh()}
            />
          }
          contentContainerStyle={state.status === 'empty' ? styles.emptyContent : undefined}
          ListEmptyComponent={
            <View testID="notifications.empty-state" style={styles.empty}>
              <Icon name="ic_notification" size={34} color={colors.iconSecondary} />
              <Text style={styles.emptyTitle}>{t('noti.inbox.empty.title')}</Text>
              <Text style={styles.sub}>{t('noti.inbox.empty.body')}</Text>
            </View>
          }
          ListHeaderComponent={
            state.refreshing ? (
              <ActivityIndicator
                testID="notifications.refresh-indicator"
                color={colors.actionPrimary}
              />
            ) : undefined
          }
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator
                testID="notifications.load-more-indicator"
                color={colors.actionPrimary}
                style={styles.more}
              />
            ) : undefined
          }
        />
      ) : null}
    </View>
  );
}

function Row({ item, onPress }: { item: NotificationItemView; onPress: () => void }) {
  return (
    <Pressable
      testID={`notifications.item-${item.id}`}
      accessibilityRole="button"
      accessibilityValue={{ text: item.unread ? '읽지 않음' : '읽음' }}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.dotColumn}>
        {item.unread ? (
          <View testID={`notifications.item-unread-${item.id}`} style={styles.dot} />
        ) : null}
      </View>
      <View style={styles.texts}>
        <Text
          testID={`notifications.item-title-${item.id}`}
          style={styles.itemTitle}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <Text
          testID={`notifications.item-body-${item.id}`}
          style={styles.itemBody}
          numberOfLines={2}
        >
          {item.body}
        </Text>
        <Text testID={`notifications.item-time-${item.id}`} style={styles.time}>
          {item.timeLabel}
        </Text>
      </View>
      <RemoteImage
        testID={`notifications.item-thumbnail-${item.id}`}
        uri={item.thumbnailUrl}
        style={styles.thumb}
      />
    </Pressable>
  );
}

// 원본 근거: docs/design/screens-c.md §3.1 (상단 바 72, 행 위아래 24, 점 8 inputCursor, 썸네일 44/6, 구분선 border).
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: {
    height: 72,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  barBack: { position: 'absolute', left: 20 },
  title: { ...typography.headline, color: colors.textPrimary, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  spinner: { marginBottom: spacing.lg },
  loadingText: { ...typography.subheadline, color: colors.textSecondary },
  errorBox: { gap: spacing.xl },
  emptyContent: { flexGrow: 1 },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: 144,
    paddingHorizontal: spacing.screenHorizontal,
  },
  emptyTitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  sub: { ...typography.subheadline, color: colors.textMuted, textAlign: 'center' },
  more: { paddingVertical: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xl,
    marginHorizontal: spacing.screenHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dotColumn: { width: spacing.md, paddingTop: spacing.xs },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: spacing.xs,
    backgroundColor: colors.inputCursor,
  },
  texts: { flex: 1, marginLeft: spacing.md, gap: spacing.sm },
  itemTitle: { ...typography.subheadline, color: colors.textPrimary },
  itemBody: { ...typography.caption, color: colors.textSecondary },
  time: { ...typography.caption, color: colors.textInactive },
  thumb: { width: 44, height: 44, marginLeft: spacing.lg, borderRadius: 6, overflow: 'hidden' },
});
