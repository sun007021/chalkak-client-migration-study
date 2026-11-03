import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import type {
  NotificationInboxViewModel,
  NotificationItemView,
} from './NotificationInboxViewModel';

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
        <Pressable
          testID="notifications.back-button"
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onBack}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <Text style={styles.title}>{t('noti.inbox.title')}</Text>
      </View>

      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator testID="notifications.loading" />
          <Text style={styles.message}>{t('noti.inbox.loading')}</Text>
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View testID="notifications.error-state" style={styles.center}>
          <Text style={styles.message}>{state.errorMessage ?? t('noti.inbox.error')}</Text>
          <Pressable
            testID="notifications.retry-button"
            accessibilityRole="button"
            onPress={() => void viewModel.retry()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>{t('noti.inbox.retry')}</Text>
          </Pressable>
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
              refreshing={state.refreshing}
              onRefresh={() => void viewModel.refresh()}
            />
          }
          contentContainerStyle={state.status === 'empty' ? styles.emptyContent : undefined}
          ListEmptyComponent={
            <View testID="notifications.empty-state" style={styles.center}>
              <Text style={styles.message}>{t('noti.inbox.empty.title')}</Text>
              <Text style={styles.sub}>{t('noti.inbox.empty.body')}</Text>
            </View>
          }
          ListHeaderComponent={
            state.refreshing ? (
              <ActivityIndicator testID="notifications.refresh-indicator" />
            ) : undefined
          }
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator testID="notifications.load-more-indicator" style={styles.more} />
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
      onPress={onPress}
      style={styles.row}
    >
      {item.thumbnailUrl ? (
        <Image
          testID={`notifications.item-thumbnail-${item.id}`}
          source={{ uri: item.thumbnailUrl }}
          style={styles.thumb}
        />
      ) : (
        // 썸네일이 없으면 대체 이미지 자리.
        <View
          testID={`notifications.item-thumbnail-${item.id}`}
          style={[styles.thumb, styles.thumbEmpty]}
        />
      )}
      <View style={styles.texts}>
        <Text
          testID={`notifications.item-title-${item.id}`}
          style={styles.itemTitle}
          numberOfLines={1}
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
      {item.unread ? (
        <View testID={`notifications.item-unread-${item.id}`} style={styles.dot} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  back: { paddingRight: spacing.md },
  backText: { fontSize: 20, color: colors.textPrimary },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyContent: { flexGrow: 1 },
  message: { fontSize: 15, color: colors.textPrimary, textAlign: 'center', marginTop: spacing.sm },
  sub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
  retry: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  retryText: { fontSize: 14, color: colors.textPrimary },
  more: { padding: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: { width: 48, height: 48, borderRadius: 8, marginRight: spacing.md },
  thumbEmpty: { backgroundColor: colors.surface },
  texts: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  itemBody: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginLeft: spacing.sm,
  },
});
