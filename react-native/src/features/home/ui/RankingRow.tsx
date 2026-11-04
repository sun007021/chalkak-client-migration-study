import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { format, t } from '../../../shared/copy';
import { colors, radius, spacing, typography } from '../../../shared/design/tokens';
import { Icon } from '../../../shared/ui/icons/Icon';
import { RemoteImage } from '../../../shared/ui/RemoteImage';
import { RoundIconButton } from '../../../shared/ui/RoundIconButton';
import { Skeleton } from '../../../shared/ui/Skeleton';
import type { PostSummary } from '../../../data/post/PostModels';
import type { RankingKey, RankingSection } from '../HomeState';
import { Text } from '../../../shared/ui/Text';
import { SectionHeader } from './SectionHeader';

type Ids = {
  section: string;
  moreLink: string;
  empty: string;
  error: string;
  retry: string;
  item: (postId: string) => string;
  image: (postId: string) => string;
  imageError: (postId: string) => string;
  likeButton: (postId: string) => string;
  likeCount: (postId: string) => string;
};

/** 어제 랭킹(`home.ranking-*`)과 오늘 인기(`home.popular-*`)는 모양이 같고 testID 접두사만 다르다. */
const IDS: Record<RankingKey, Ids> = {
  yesterday: {
    section: 'home.ranking-section',
    moreLink: 'home.ranking-more-link',
    empty: 'home.ranking-empty',
    error: 'home.ranking-error',
    retry: 'home.ranking-retry-button',
    item: (id) => `home.ranking-item-${id}`,
    image: (id) => `home.ranking-image-${id}`,
    imageError: (id) => `home.ranking-image-error-${id}`,
    likeButton: (id) => `home.ranking-like-button-${id}`,
    likeCount: (id) => `home.ranking-like-count-${id}`,
  },
  popular: {
    section: 'home.popular-section',
    moreLink: 'home.popular-more-link',
    empty: 'home.popular-empty',
    error: 'home.popular-error',
    retry: 'home.popular-retry-button',
    item: (id) => `home.popular-item-${id}`,
    image: (id) => `home.popular-image-${id}`,
    imageError: (id) => `home.popular-image-error-${id}`,
    likeButton: (id) => `home.popular-like-button-${id}`,
    likeCount: (id) => `home.popular-like-count-${id}`,
  },
};

type Props = {
  rankingKey: RankingKey;
  title: string;
  section: RankingSection;
  onItemPress: (postId: string) => void;
  onLikePress: (postId: string) => void;
  onMorePress: () => void;
  onRetry: () => void;
};

export function RankingRow({
  rankingKey,
  title,
  section,
  onItemPress,
  onLikePress,
  onMorePress,
  onRetry,
}: Props) {
  const ids = IDS[rankingKey];
  return (
    <View testID={ids.section} style={styles.root}>
      <SectionHeader
        title={title}
        moreLabel={t('home.weekly.more')}
        moreTestID={ids.moreLink}
        onMorePress={onMorePress}
      />
      {section.status === 'loading' ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={styles.photo} />
          ))}
        </View>
      ) : null}
      {section.status === 'error' ? (
        <View style={styles.message}>
          <Text testID={ids.error} style={styles.messageText}>
            {format(t('home.ranking.error'), { '섹션 제목': title })}
          </Text>
          <RoundIconButton
            testID={ids.retry}
            accessibilityLabel={t('common.retry')}
            size={32}
            iconSize={15}
            onPress={onRetry}
          />
        </View>
      ) : null}
      {section.status === 'ready' && section.posts.length === 0 ? (
        <View style={styles.message}>
          <Text testID={ids.empty} style={styles.messageText}>
            {t('home.ranking.empty')}
          </Text>
        </View>
      ) : null}
      {section.status === 'ready' && section.posts.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {section.posts.map((post) => (
            <RankingItem
              key={post.id}
              post={post}
              ids={ids}
              title={title}
              onPress={() => onItemPress(post.id)}
              onLikePress={() => onLikePress(post.id)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function RankingItem({
  post,
  ids,
  title,
  onPress,
  onLikePress,
}: {
  post: PostSummary;
  ids: Ids;
  title: string;
  onPress: () => void;
  onLikePress: () => void;
}) {
  const uri = post.thumbnailImageUrl ?? post.originalImageUrl;
  // 이 항목의 이미지만 불러오지 못하면 그 자리에 안내 문구를 둔다(D-20). 다른 항목·좋아요는 그대로다.
  // 같은 항목의 URL이 바뀌면(새로고침) 실패 기록을 버리고 다시 시도한다.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = failedUri === uri;
  return (
    <Pressable
      testID={ids.item(post.id)}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.item}
    >
      {failed ? (
        <View style={[styles.photo, styles.photoFallback]}>
          <Text testID={ids.imageError(post.id)} style={styles.fallbackText}>
            {format(t('home.ranking.error'), { '섹션 제목': title })}
          </Text>
        </View>
      ) : (
        <RemoteImage
          testID={ids.image(post.id)}
          uri={uri}
          style={styles.photo}
          onError={() => setFailedUri(uri)}
        />
      )}
      <Pressable
        testID={ids.likeButton(post.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: post.isLiked }}
        onPress={onLikePress}
        hitSlop={6}
        style={styles.like}
      >
        <Icon
          name={post.isLiked ? 'ic_heart_filled' : 'ic_heart'}
          size={14}
          color={colors.textOnImage}
        />
        <Text testID={ids.likeCount(post.id)} style={styles.likeCount}>
          {String(post.likeCount)}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// 원본 HomeRankingRow(screens-a.md §7.7): 카드 82x82, 간격 16, 라운드 small(7), calendarCell, 화면 끝까지 스크롤(contentPadding 25).
const CARD = 82;

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  message: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenHorizontal,
  },
  messageText: { ...typography.footnote, color: colors.textSecondary },
  list: { paddingHorizontal: spacing.screenHorizontal, gap: spacing.lg },
  item: { width: CARD, height: CARD },
  photo: {
    width: CARD,
    height: CARD,
    borderRadius: radius.small,
    backgroundColor: colors.calendarCell,
    overflow: 'hidden',
  },
  photoFallback: { alignItems: 'center', justifyContent: 'center', padding: spacing.xs },
  fallbackText: { ...typography.caption, textAlign: 'center', color: colors.textSecondary },
  like: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  likeCount: {
    ...typography.caption,
    color: colors.textOnImage,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 2,
    textShadowOffset: { width: 0, height: 1 },
  },
});
