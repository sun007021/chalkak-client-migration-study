import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { format, t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import type { PostSummary } from '../../../data/post/PostModels';
import type { RankingKey, RankingSection } from '../HomeState';

type Ids = {
  section: string;
  moreLink: string;
  empty: string;
  error: string;
  retry: string;
  item: (postId: string) => string;
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
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          testID={ids.moreLink}
          accessibilityRole="button"
          accessibilityLabel={title}
          onPress={onMorePress}
          hitSlop={8}
        >
          <Text style={styles.more}>{'>'}</Text>
        </Pressable>
      </View>
      {section.status === 'loading' ? <ActivityIndicator style={styles.loading} /> : null}
      {section.status === 'error' ? (
        <View style={styles.message}>
          <Text testID={ids.error} style={styles.messageText}>
            {format(t('home.ranking.error'), { '섹션 제목': title })}
          </Text>
          <Pressable testID={ids.retry} accessibilityRole="button" onPress={onRetry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {section.status === 'ready' && section.posts.length === 0 ? (
        <Text testID={ids.empty} style={styles.messageText}>
          {t('home.ranking.empty')}
        </Text>
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
  onPress,
  onLikePress,
}: {
  post: PostSummary;
  ids: Ids;
  onPress: () => void;
  onLikePress: () => void;
}) {
  const uri = post.thumbnailImageUrl ?? post.originalImageUrl;
  return (
    <Pressable
      testID={ids.item(post.id)}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.item}
    >
      <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
      <Pressable
        testID={ids.likeButton(post.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: post.isLiked }}
        onPress={onLikePress}
        hitSlop={6}
        style={styles.like}
      >
        <Text style={[styles.likeIcon, post.isLiked && styles.liked]}>
          {post.isLiked ? '♥' : '♡'}
        </Text>
        <Text testID={ids.likeCount(post.id)} style={styles.likeCount}>
          {String(post.likeCount)}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: spacing.lg, gap: spacing.md },
  header: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  more: { fontSize: 18, color: colors.textSecondary },
  loading: { padding: spacing.lg },
  message: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  messageText: { paddingHorizontal: spacing.lg, color: colors.textSecondary },
  retryText: { color: colors.accent, fontWeight: '600' },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  item: { width: 132, gap: spacing.xs },
  photo: { width: 132, height: 132, borderRadius: 12, backgroundColor: colors.surface },
  like: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  likeIcon: { fontSize: 16, color: colors.textSecondary },
  liked: { color: colors.accent },
  likeCount: { fontSize: 13, color: colors.textSecondary },
});
