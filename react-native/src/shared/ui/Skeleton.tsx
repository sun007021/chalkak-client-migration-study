import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../design/tokens';

// 원본 근거: docs/design/screens-a.md §1.8 (ChalkakSkeleton). 바탕 skeletonBase, 밴드 폭 0.6 x 너비,
// 왼쪽 밖에서 오른쪽 끝까지 linear 1.2초 반복.
const BAND_RATIO = 0.6;
const SHIMMER_MS = 1200;
/** 로딩이 이 시간 안에 끝나면 스켈레톤을 띄우지 않고, 한 번 뜨면 최소 이만큼 유지한다(loadingSkeleton). */
export const SKELETON_SHOW_DELAY_MS = 500;
export const SKELETON_MIN_VISIBLE_MS = 250;

/** 부모가 모서리를 잘라야 한다(clip은 호출부 책임). 크기는 style로 준다. */
export function Skeleton({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const [width, setWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SHIMMER_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const band = width * BAND_RATIO;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-band, width],
  });

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.base, style]}
    >
      {width > 0 ? (
        <Animated.View style={[styles.band, { width: band, transform: [{ translateX }] }]}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.skeletonHighlight} stopOpacity={0} />
                <Stop offset="0.5" stopColor={colors.skeletonHighlight} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.skeletonHighlight} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#shimmer)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * loading이 true인 동안 스켈레톤을 보일지 정한다: 0.5초 지연 표시, 한 번 뜨면 최소 0.25초 유지(screens-a.md §1.8).
 * 화면 표시용 지연 타이머라 `Clock`을 쓰지 않는다(시계를 읽지 않고 타이머만 쓴다).
 */
export function useDelayedSkeleton(loading: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const minHeld = useRef(false);
  const hideWhenReleased = useRef(false);

  useEffect(() => {
    if (loading) {
      hideWhenReleased.current = false;
      if (visible) return undefined;
      const id = setTimeout(() => {
        minHeld.current = true;
        setVisible(true);
        setTimeout(() => {
          minHeld.current = false;
          if (hideWhenReleased.current) setVisible(false);
        }, SKELETON_MIN_VISIBLE_MS);
      }, SKELETON_SHOW_DELAY_MS);
      return () => clearTimeout(id);
    }
    if (visible) {
      if (minHeld.current) hideWhenReleased.current = true;
      else setVisible(false);
    }
    return undefined;
  }, [loading, visible]);

  return visible;
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.skeletonBase, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
