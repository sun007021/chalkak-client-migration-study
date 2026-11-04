import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { Text } from '../../shared/ui/Text';
import { useViewModelState } from '../state/useViewModelState';
import type { ToastCenter } from './ToastCenter';

// 원본 근거: docs/design/screens-a.md §1.9 (ChalkakToast). actionPrimary 캡슐, subheadline onActionPrimary,
// 패딩 가로 16 세로 12, 좌우 여백 25, 아래에서 올라오며 페이드(snappy ≈ 250ms).
const ENTER_MS = 250;
/** 하단 바(약 70) 위에 뜨도록 안전 영역 위로 띄우는 거리. */
const BOTTOM_OFFSET = 96;
const SLIDE_DISTANCE = 24;

/** 화면 위에 토스트를 그린다. 떠 있는 동안만 요소가 존재한다(testIDs.md toast.*). 터치는 아래 화면으로 통과시킨다. */
export function ToastHost({ center }: { center: ToastCenter }) {
  const { current } = useViewModelState(center);
  const insets = useSafeAreaInsets();
  if (current === null) return null;
  return (
    <View pointerEvents="none" style={[styles.layer, { bottom: insets.bottom + BOTTOM_OFFSET }]}>
      <ToastBubble key={current.id} message={current.message} />
    </View>
  );
}

function ToastBubble({ message }: { message: string }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);
  return (
    <Animated.View
      testID="toast.container"
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [SLIDE_DISTANCE, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text testID="toast.message" style={styles.text}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: spacing.screenHorizontal,
    right: spacing.screenHorizontal,
    alignItems: 'center',
  },
  toast: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.actionPrimary,
  },
  text: { ...typography.subheadline, color: colors.onActionPrimary, textAlign: 'center' },
});
