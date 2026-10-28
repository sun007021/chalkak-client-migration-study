import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { PostSummary } from '../../../data/post/PostModels';
import { colors, spacing } from '../../../shared/ui/theme';
import { PhotoTile } from './PhotoTile';

type Props = {
  posts: readonly PostSummary[];
  page: number;
  ratios: Readonly<Record<string, number>>;
  onPageChanged: (page: number) => void;
  onPress: (postId: string) => void;
  onLikePress: (postId: string) => void;
  onImageLoad: (postId: string, ratio: number) => void;
};

const IDS = {
  item: 'display.featured-item-',
  likeButton: 'display.featured-like-button-',
  likeCount: 'display.featured-like-count-',
};

/** 아카이브의 인기 상위 5장을 가로로 넘겨 보는 추천 카드. 보던 페이지는 ViewModel이 기억한다. */
export function FeaturedPager({
  posts,
  page,
  ratios,
  onPageChanged,
  onPress,
  onLikePress,
  onImageLoad,
}: Props) {
  const [width, setWidth] = useState(0);
  const onEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    onPageChanged(Math.round(event.nativeEvent.contentOffset.x / width));
  };
  return (
    <View
      testID="display.featured-pager"
      style={styles.root}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // 레이아웃 폭을 알고 나서 보던 페이지로 되돌린다.
        contentOffset={{ x: page * width, y: 0 }}
        onMomentumScrollEnd={onEnd}
      >
        {posts.map((post) => (
          <View key={post.id} style={[styles.page, width > 0 && { width }]}>
            <View style={styles.card}>
              <PhotoTile
                post={post}
                ids={IDS}
                ratio={ratios[post.id] ?? 1}
                onPress={() => onPress(post.id)}
                onLikePress={() => onLikePress(post.id)}
                onImageLoad={(ratio) => onImageLoad(post.id, ratio)}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface, paddingVertical: spacing.md },
  page: { width: 320, paddingHorizontal: spacing.lg },
  card: { flex: 1 },
});
