import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PostSummary } from '../../../data/post/PostModels';
import { format, t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import { LikeButton } from '../../like/LikeButton';

type Props = {
  post: PostSummary;
  /** testID 접두사: 그리드는 `display.item-` 계열, 추천 카드는 `display.featured-` 계열. */
  ids: { item: string; likeButton: string; likeCount: string };
  /** 가로/세로. 아직 모르면 정사각형으로 그린다. */
  ratio: number;
  onPress: () => void;
  onLikePress: () => void;
  onImageLoad?: (ratio: number) => void;
  onLayout?: (event: { nativeEvent: { layout: { y: number; height: number } } }) => void;
};

/** 사진 한 장과 제목, 하트. 그리드와 추천 카드가 같이 쓴다. */
export function PhotoTile({
  post,
  ids,
  ratio,
  onPress,
  onLikePress,
  onImageLoad,
  onLayout,
}: Props) {
  const uri = post.thumbnailImageUrl ?? post.originalImageUrl;
  const label =
    post.title === null || post.title === ''
      ? t('feed.photo-alt-none')
      : format(t('feed.photo-alt'), { 제목: post.title });
  return (
    <View style={styles.root} onLayout={onLayout}>
      <Pressable
        testID={`${ids.item}${post.id}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
      >
        <Image
          source={{ uri }}
          style={[styles.photo, { aspectRatio: ratio }]}
          resizeMode="cover"
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source ?? {};
            if (onImageLoad && width && height) onImageLoad(width / height);
          }}
        />
      </Pressable>
      <View style={styles.footer}>
        <Text style={styles.title} numberOfLines={1}>
          {post.title ?? t('feed.title-none')}
        </Text>
        <LikeButton
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
  root: { gap: spacing.xs },
  photo: { width: '100%', borderRadius: 12, backgroundColor: colors.surface },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 13, color: colors.textPrimary, marginRight: spacing.sm },
});
