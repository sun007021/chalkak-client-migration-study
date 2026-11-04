import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { formatTopicDateLabel } from '../../core/time/dateFormat';
import type { KstDate } from '../../core/time/KstDate';
import { format, t } from '../../shared/copy';
import { colors, spacing, typography } from '../../shared/design/tokens';
import { BackButton } from '../../shared/ui/BackButton';
import { Icon } from '../../shared/ui/icons/Icon';
import { RemoteImage } from '../../shared/ui/RemoteImage';
import { RoundIconButton } from '../../shared/ui/RoundIconButton';
import { Skeleton } from '../../shared/ui/Skeleton';
import { LikeButton } from '../like/LikeButton';
import { DeleteDialog, TitleDialog } from './ui/FeedDialogs';
import { ZoomablePhoto } from './ui/ZoomablePhoto';
import type { FeedViewModel } from './FeedViewModel';
import { Text } from '../../shared/ui/Text';

/**
 * 게시물 상세 화면. testID는 docs/testing/testids.md의 feed 표를 따른다.
 * 마운트 = onShown, 언마운트 = onHidden. ViewModel을 만들고 버리는 것은 소유자(라우트)다.
 */
export type FeedScreenProps = {
  viewModel: FeedViewModel;
  /** AI 피드백 알약. 내 게시물이고 상세 응답으로 주제 날짜가 확정된 뒤에만 부른다(AI 피드백 영역이 채운다). */
  renderAiReview?: (args: { postId: string; topicDate: KstDate }) => ReactNode;
};

export function FeedScreen({ viewModel, renderAiReview }: FeedScreenProps) {
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
        <BackButton
          testID="feed.back-button"
          accessibilityLabel={t('common.close')}
          onPress={() => viewModel.onBackPress()}
        />
        <View style={styles.barSpacer} />
        {state.canEditTitle ? (
          <Pressable
            testID="feed.edit-title-button"
            accessibilityRole="button"
            accessibilityLabel={t('feed.edit.title')}
            onPress={() => viewModel.openTitleEditor()}
            style={styles.barButton}
          >
            <Icon name="ic_edit" size={24} color={colors.actionPrimary} />
          </Pressable>
        ) : null}
        {state.canDelete ? (
          <Pressable
            testID="feed.delete-button"
            accessibilityRole="button"
            accessibilityLabel={t('feed.delete.title')}
            onPress={() => viewModel.requestDelete()}
            style={styles.barButton}
          >
            <Icon name="ic_delete" size={24} color={colors.error} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.topic}>
        {/* 상세를 받기 전에도 높이를 유지한다(사진 위치가 튀지 않게, screens-b.md §4.1). */}
        <Text testID="feed.date-label" style={styles.topicDate}>
          {content?.topicDate ? formatTopicDateLabel(content.topicDate) : ' '}
        </Text>
      </View>

      {state.status === 'loading' ? (
        <View testID="feed.loading" style={styles.loading}>
          <Skeleton style={styles.loadingPhoto} />
        </View>
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
          <RoundIconButton
            testID="feed.retry-button"
            accessibilityLabel={t('common.retry')}
            size={48}
            iconSize={20}
            onPress={() => void viewModel.retry()}
          />
        </View>
      ) : null}

      {content ? (
        <View style={styles.body}>
          <ZoomablePhoto
            uri={content.originalImageUrl}
            thumbnailUri={content.thumbnailImageUrl}
            accessibilityLabel={photoLabel}
          >
            {signature && failedSignature !== signature ? (
              <RemoteImage
                testID="feed.signature-image"
                uri={signature}
                resizeMode="contain"
                style={styles.signature}
                // 사인만 못 불러와도 사진은 그대로 둔다.
                onError={() => setFailedSignature(signature)}
              />
            ) : null}
          </ZoomablePhoto>
          <View style={styles.likeRow}>
            <LikeButton
              buttonTestID="feed.like-button"
              countTestID="feed.like-count"
              isLiked={content.isLiked}
              likeCount={content.likeCount}
              disabled={!state.canLike}
              onPress={() => viewModel.onLikePress()}
            />
            <Text testID="feed.title" style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
            {renderAiReview && state.confirmed && state.isMine && content.topicDate
              ? renderAiReview({ postId: content.postId, topicDate: content.topicDate })
              : null}
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

// 원본 피드(screens-b.md §4.1): 상단 바(뒤로 48 + 수정·삭제 아이콘 48), 주제 라벨 subheadline(좌우 25),
// 사진, 좋아요 행(높이 57, 좌우 14, 하트 24 + 숫자 / 제목 body textSecondary 오른쪽, 아래 0.5px border).
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  barSpacer: { flex: 1 },
  barButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  topic: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  topicDate: { ...typography.subheadline, color: colors.textPrimary },
  loading: { flex: 1, paddingBottom: spacing.xxl },
  loadingPhoto: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  message: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  body: { flex: 1 },
  signature: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, width: 70, height: 52 },
  likeRow: {
    height: 57,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...typography.body, flex: 1, textAlign: 'right', color: colors.textSecondary },
  footer: { paddingHorizontal: spacing.screenHorizontal, paddingTop: spacing.lg, gap: spacing.md },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
});
