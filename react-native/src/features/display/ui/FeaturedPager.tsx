import { useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { PostSummary } from '../../../data/post/PostModels';
import { colors, spacing } from '../../../shared/design/tokens';
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

// 원본 대표 사진 캐러셀(screens-b.md §2.3): 페이지 폭 = 컨테이너 - 64, 좌우 contentMargin 32, 페이지 간격 5,
// 이웃 카드 scale 1-0.08·|phase|, opacity 1-0.12·|phase|. 표시기: 선택 24x7 actionPrimary, 나머지 7x7 textMuted 45%.
const SIDE_MARGIN = 32;
const PAGE_GAP = 5;
const SCALE_STEP = 0.08;
const OPACITY_STEP = 0.12;
const INDICATOR_GAP = 8;

/** 아카이브의 인기 상위 5장을 가로로 넘겨 보는 대표 사진. 보던 페이지는 ViewModel이 기억한다. */
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
  const scrollX = useRef(new Animated.Value(0)).current;
  const pageWidth = Math.max(width - SIDE_MARGIN * 2, 0);
  const interval = pageWidth + PAGE_GAP;

  const onEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interval <= 0) return;
    onPageChanged(Math.round(event.nativeEvent.contentOffset.x / interval));
  };
  return (
    <View
      testID="display.featured-pager"
      style={styles.root}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.ScrollView
        horizontal
        snapToInterval={interval > 0 ? interval : undefined}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: SIDE_MARGIN, gap: PAGE_GAP }}
        // 레이아웃 폭을 알고 나서 보던 페이지로 되돌린다.
        contentOffset={{ x: page * interval, y: 0 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: true,
        })}
        onMomentumScrollEnd={onEnd}
      >
        {posts.map((post, index) => {
          const input = [(index - 1) * interval, index * interval, (index + 1) * interval];
          const animated =
            interval > 0
              ? {
                  opacity: scrollX.interpolate({
                    inputRange: input,
                    outputRange: [1 - OPACITY_STEP, 1, 1 - OPACITY_STEP],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: scrollX.interpolate({
                        inputRange: input,
                        outputRange: [1 - SCALE_STEP, 1, 1 - SCALE_STEP],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                }
              : null;
          return (
            <Animated.View key={post.id} style={[width > 0 && { width: pageWidth }, animated]}>
              <PhotoTile
                featured
                post={post}
                ids={IDS}
                ratio={ratios[post.id] ?? 3 / 4}
                onPress={() => onPress(post.id)}
                onLikePress={() => onLikePress(post.id)}
                onImageLoad={(ratio) => onImageLoad(post.id, ratio)}
              />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
      <View style={styles.indicator}>
        {posts.map((post, index) => (
          <View key={post.id} style={[styles.dot, index === page && styles.dotSelected]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginHorizontal: -spacing.screenHorizontal, paddingTop: 15, paddingBottom: spacing.sm },
  indicator: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: INDICATOR_GAP,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.textMuted,
    opacity: 0.45,
  },
  dotSelected: { width: 24, backgroundColor: colors.actionPrimary, opacity: 1 },
});
