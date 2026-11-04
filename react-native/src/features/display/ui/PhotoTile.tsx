import { Pressable, StyleSheet, View } from 'react-native';

import type { PostSummary } from '../../../data/post/PostModels';
import { format, t } from '../../../shared/copy';
import { radius, typography } from '../../../shared/design/tokens';
import { RemoteImage } from '../../../shared/ui/RemoteImage';
import { Text } from '../../../shared/ui/Text';
import { LikeButton } from '../../like/LikeButton';

type Props = {
  post: PostSummary;
  /** testID 접두사: 그리드는 `display.item-` 계열, 추천 카드는 `display.featured-` 계열. */
  ids: { item: string; likeButton: string; likeCount: string };
  /** 가로/세로. 아직 모르면 3:4로 그린다(원본 iOS 기본). */
  ratio: number;
  onPress: () => void;
  onLikePress: () => void;
  onImageLoad?: (ratio: number) => void;
  onLayout?: (event: { nativeEvent: { layout: { y: number; height: number } } }) => void;
  /** 추천 카드: 사진을 fit으로 보이고 제목을 아래 가운데에 손글씨로 올린다. */
  featured?: boolean;
};

/** 기본 비율(가로/세로). iOS 기본 세로/가로 4/3 (screens-b.md §2.2). */
export const DEFAULT_PHOTO_RATIO = 3 / 4;
const BADGE_INSET = 10;

/**
 * 사진 한 장 + 좋아요 배지. 그리드와 추천 카드가 같이 쓴다.
 * 원본 카드: 검정 바탕, 라운드 photoCard(12), 좌하단 좋아요 배지, 로딩은 스켈레톤.
 */
export function PhotoTile({
  post,
  ids,
  ratio,
  onPress,
  onLikePress,
  onImageLoad,
  onLayout,
  featured = false,
}: Props) {
  const uri = post.thumbnailImageUrl ?? post.originalImageUrl;
  const label =
    post.title === null || post.title === ''
      ? t('feed.photo-alt-none')
      : format(t('feed.photo-alt'), { 제목: post.title });
  return (
    <View
      style={[styles.card, featured ? styles.featured : { aspectRatio: ratio }]}
      onLayout={onLayout}
    >
      <Pressable
        testID={`${ids.item}${post.id}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      >
        <RemoteImage
          testID={`${ids.item}${post.id}-photo`}
          uri={uri}
          resizeMode={featured ? 'contain' : 'cover'}
          style={StyleSheet.absoluteFill}
          onLoad={({ width, height }) => {
            if (onImageLoad && width && height) onImageLoad(width / height);
          }}
        />
      </Pressable>
      {featured && post.title ? (
        <Text pointerEvents="none" numberOfLines={1} style={styles.featuredTitle}>
          {post.title}
        </Text>
      ) : null}
      <View style={styles.badge}>
        <LikeButton
          onPhoto
          buttonTestID={`${ids.likeButton}${post.id}`}
          countTestID={`${ids.likeCount}${post.id}`}
          isLiked={post.isLiked}
          likeCount={post.likeCount}
          onPress={onLikePress}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.photoCard,
    backgroundColor: '#000000',
  },
  featured: { aspectRatio: 3 / 4 },
  badge: { position: 'absolute', left: BADGE_INSET, bottom: BADGE_INSET },
  featuredTitle: {
    ...typography.handwriting,
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    textAlign: 'center',
    color: '#FFFFFF',
  },
});
