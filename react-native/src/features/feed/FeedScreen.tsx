import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { formatTopicDateLabel } from '../../core/time/dateFormat';
import { format, t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import { LikeButton } from '../like/LikeButton';
import { DeleteDialog, TitleDialog } from './ui/FeedDialogs';
import { ZoomablePhoto } from './ui/ZoomablePhoto';
import type { FeedViewModel } from './FeedViewModel';

/**
 * 게시물 상세 화면. testID는 docs/testing/testids.md의 feed 표를 따른다.
 * 마운트 = onShown, 언마운트 = onHidden. ViewModel을 만들고 버리는 것은 소유자(라우트)다.
 */
export function FeedScreen({ viewModel }: { viewModel: FeedViewModel }) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  const [failedSignature, setFailedSignature] = useState<string | null>(null);

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  const content = state.status === 'content' ? state.content : null;
  const title = content?.title ? content.title : t('feed.title-none');
  const photoLabel = content?.title
    ? format(t('feed.photo-alt'), { 제목: content.title })
    : t('feed.photo-alt-none');
  const signature = content?.signatureOriginalImageUrl ?? null;

  return (
    <View testID="feed.root" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          testID="feed.back-button"
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => viewModel.onBackPress()}
          hitSlop={8}
          style={styles.back}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        {content?.topicDate ? (
          <Text testID="feed.date-label" style={styles.date}>
            {formatTopicDateLabel(content.topicDate)}
          </Text>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <ActivityIndicator testID="feed.loading" style={styles.center} />
      ) : null}
      {state.status === 'not-found' ? (
        <View style={styles.center}>
          <Text testID="feed.not-found-state" style={styles.message}>
            {t('feed.error.not-found')}
          </Text>
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View style={styles.center}>
          <Text testID="feed.error-state" style={styles.message}>
            {state.errorMessage ?? t('feed.error.load')}
          </Text>
          <Pressable
            testID="feed.retry-button"
            accessibilityRole="button"
            onPress={() => void viewModel.retry()}
            style={styles.retry}
          >
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {content ? (
        <View style={styles.body}>
          <ZoomablePhoto uri={content.originalImageUrl} accessibilityLabel={photoLabel}>
            {signature && failedSignature !== signature ? (
              <Image
                testID="feed.signature-image"
                source={{ uri: signature }}
                style={styles.signature}
                resizeMode="contain"
                // 사인만 못 불러와도 사진은 그대로 둔다.
                onError={() => setFailedSignature(signature)}
              />
            ) : null}
          </ZoomablePhoto>
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.titleRow}>
              <Text testID="feed.title" style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <LikeButton
                buttonTestID="feed.like-button"
                countTestID="feed.like-count"
                isLiked={content.isLiked}
                likeCount={content.likeCount}
                disabled={!state.canLike}
                onPress={() => viewModel.onLikePress()}
              />
            </View>
            <View style={styles.actions}>
              {state.canEditTitle ? (
                <Pressable
                  testID="feed.edit-title-button"
                  accessibilityRole="button"
                  accessibilityLabel={t('feed.edit.title')}
                  onPress={() => viewModel.openTitleEditor()}
                  hitSlop={8}
                >
                  <Text style={styles.actionText}>{t('feed.edit.title')}</Text>
                </Pressable>
              ) : null}
              {state.canDelete ? (
                <Pressable
                  testID="feed.delete-button"
                  accessibilityRole="button"
                  accessibilityLabel={t('feed.delete.title')}
                  onPress={() => viewModel.requestDelete()}
                  hitSlop={8}
                >
                  <Text style={styles.deleteText}>{t('feed.delete.title')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {state.deleting ? (
        <View style={styles.overlay}>
          <ActivityIndicator testID="feed.deleting" color="#FFFFFF" />
        </View>
      ) : null}

      {state.titleDialog ? (
        <TitleDialog
          dialog={state.titleDialog}
          onChangeText={(text) => viewModel.onTitleInput(text)}
          onSave={() => void viewModel.saveTitle()}
          onCancel={() => viewModel.closeTitleEditor()}
        />
      ) : null}
      {state.deleteDialogOpen ? (
        <DeleteDialog
          onConfirm={() => void viewModel.confirmDelete()}
          onCancel={() => viewModel.cancelDelete()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  back: { paddingRight: spacing.sm },
  backText: { fontSize: 22, color: colors.textPrimary },
  date: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  message: { color: colors.textSecondary, fontSize: 15 },
  retry: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  retryText: { color: '#FFFFFF', fontWeight: '600' },
  body: { flex: 1 },
  signature: { position: 'absolute', right: spacing.md, bottom: spacing.md, width: 96, height: 48 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: spacing.lg },
  actionText: { fontSize: 14, color: colors.textSecondary },
  deleteText: { fontSize: 14, color: colors.danger },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
