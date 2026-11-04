import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

// 원본 근거: docs/design/screens-b.md §7.1 (막대 5개 높이 9/15/11/18/8, 폭 2, 간격 2, 프레임 18).
// 움직임은 분석 중일 때만: 막대마다 세로 배율 0.7 + 0.3·sin(phase + index·1.2), 한 바퀴 900ms.
const BAR_HEIGHTS = [9, 15, 11, 18, 8] as const;
const BAR_WIDTH = 2;
const GAP = 2;
const FRAME = 18;
const CYCLE_MS = 900;
const SAMPLES = 12;

export function AudioWaveIcon({
  color,
  animating = false,
  scale = 1,
}: {
  color: string;
  animating?: boolean;
  /** 프레임을 키울 때의 배율(피드 pill은 24/18). */
  scale?: number;
}) {
  const [phase] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!animating) return;
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      phase.setValue(0);
    };
  }, [animating, phase]);

  const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { transform: [{ scale }] }]}
    >
      {BAR_HEIGHTS.map((height, index) => {
        const outputRange = inputRange.map(
          (p) => 0.7 + 0.3 * Math.sin(p * Math.PI * 2 + index * 1.2),
        );
        return (
          <Animated.View
            key={index}
            style={{
              width: BAR_WIDTH,
              height,
              borderRadius: BAR_WIDTH / 2,
              backgroundColor: color,
              transform: [
                { scaleY: animating ? phase.interpolate({ inputRange, outputRange }) : 1 },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: FRAME,
    height: FRAME,
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    justifyContent: 'center',
  },
});
