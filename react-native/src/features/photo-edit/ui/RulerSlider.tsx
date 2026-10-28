import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { colors } from '../../../shared/ui/theme';
import {
  RULER_DP_PER_UNIT,
  RULER_TICKS_PER_UNIT,
  applyDetent,
  isMajorTick,
  tickValue,
} from '../RulerScale';

/** 멈칫하는 범위(값 단위). 눈금 한 칸(0.02) 안이면 기준값으로 붙는다. */
const DETENT_RANGE = 0.02;
const VIEW_HEIGHT = 56;

export type RulerSliderProps = {
  testID: string;
  value: number;
  min: number;
  max: number;
  /** 멈칫할 기준값(0과 자동 보정 몫 등). */
  anchors?: readonly number[];
  onValueChange: (value: number) => void;
};

/**
 * 가로 눈금자. 눈금을 좌우로 끌어 값을 바꾸고(왼쪽으로 끌면 값이 커진다), 접근성 값은 100배한 정수다.
 * 단위 1.0당 400dp, 눈금 50개, 10개마다 굵은 눈금(RulerScale).
 */
export function RulerSlider({
  testID,
  value,
  min,
  max,
  anchors = [],
  onValueChange,
}: RulerSliderProps) {
  // 끌기는 누른 자리(pageX)와 그때의 값을 기억하고, 움직인 거리만큼 값을 옮긴다. 핸들러는 렌더마다 새 props를 본다.
  const drag = useRef({ startX: 0, startValue: value });
  const begin = (event: GestureResponderEvent) => {
    drag.current = { startX: event.nativeEvent.pageX, startValue: value };
  };
  const move = (event: GestureResponderEvent) => {
    const raw =
      drag.current.startValue - (event.nativeEvent.pageX - drag.current.startX) / RULER_DP_PER_UNIT;
    const clamped = Math.min(max, Math.max(min, raw));
    onValueChange(applyDetent(clamped, anchors, DETENT_RANGE));
  };

  const ticks = useMemo(() => {
    const first = Math.round(min * RULER_TICKS_PER_UNIT);
    const last = Math.round(max * RULER_TICKS_PER_UNIT);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }, [min, max]);

  const shown = Math.round(value * 100);
  const step = 1 / RULER_TICKS_PER_UNIT;
  const nudge = (delta: number) =>
    onValueChange(Math.min(max, Math.max(min, Math.round((value + delta) * 100) / 100)));

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ min: Math.round(min * 100), max: Math.round(max * 100), now: shown }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') nudge(step);
        if (event.nativeEvent.actionName === 'decrement') nudge(-step);
      }}
      style={styles.root}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={begin}
      onResponderMove={move}
      onResponderTerminationRequest={() => false}
    >
      <Text style={styles.value}>{shown}</Text>
      <View style={styles.window} pointerEvents="none">
        <View style={[styles.strip, { transform: [{ translateX: -value * RULER_DP_PER_UNIT }] }]}>
          {ticks.map((index) => (
            <View
              key={index}
              style={[
                styles.tick,
                isMajorTick(index) && styles.major,
                { left: tickValue(index) * RULER_DP_PER_UNIT },
              ]}
            />
          ))}
        </View>
        <View style={styles.indicator} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: VIEW_HEIGHT + 24, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', marginBottom: 4 },
  window: { width: '100%', height: VIEW_HEIGHT - 24, overflow: 'hidden' },
  // 가운데(0점)를 원점으로 눈금을 놓는다.
  strip: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 0 },
  tick: { position: 'absolute', top: 12, width: 1, height: 8, backgroundColor: '#8A8A8A' },
  major: { top: 6, height: 20, backgroundColor: '#FFFFFF' },
  indicator: {
    position: 'absolute',
    left: '50%',
    top: 2,
    bottom: 2,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.accent,
  },
});
