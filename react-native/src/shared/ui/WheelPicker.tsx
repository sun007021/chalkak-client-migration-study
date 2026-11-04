import { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { colors, typography } from '../design/tokens';
import { Text } from './Text';

// 원본 ChalkakWheelPicker(screens-b.md §1.3): 항목 높이 44, 보이는 개수 5(휠 높이 220), 가운데 칸 위·아래에 1px border 선.
// 거리별 스타일: 0칸 title3 / textPrimary, 1칸 body / textMuted, 2칸 이상 callout / textPrimary 22%.
const ITEM_HEIGHT = 44;
const VISIBLE = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE;
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE / 2);

export type WheelPickerProps = {
  testID?: string;
  values: readonly number[];
  selected: number;
  label: (value: number) => string;
  onSelect: (value: number) => void;
  /** 접근성 이름(연도, 월, 일). */
  accessibilityLabel?: string;
};

export function WheelPicker({
  testID,
  values,
  selected,
  label,
  onSelect,
  accessibilityLabel,
}: WheelPickerProps) {
  const ref = useRef<ScrollViewInstance>(null);
  const selectedIndex = Math.max(0, values.indexOf(selected));

  // 바깥에서 선택값이 바뀌면(범위 보정 포함) 애니메이션 없이 제자리에서 맞춘다.
  useEffect(() => {
    ref.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
  }, [selectedIndex, values]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const value = values[Math.min(Math.max(index, 0), values.length - 1)];
    if (value !== undefined && value !== selected) onSelect(value);
  };

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.band} />
      <ScrollView
        ref={ref}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={styles.scroll}
        contentContainerStyle={{ paddingVertical: PAD }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
      >
        {values.map((value, index) => {
          const distance = Math.abs(index - selectedIndex);
          return (
            <Pressable
              key={value}
              testID={testID ? `${testID}-${value}` : undefined}
              accessibilityRole="button"
              accessibilityState={{ selected: value === selected }}
              onPress={() => {
                ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
                onSelect(value);
              }}
              style={styles.item}
            >
              <Text
                style={distance === 0 ? styles.near0 : distance === 1 ? styles.near1 : styles.far}
              >
                {label(value)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, height: WHEEL_HEIGHT },
  scroll: { height: WHEEL_HEIGHT },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    zIndex: 1,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  near0: { ...typography.title3, color: colors.textPrimary },
  near1: { ...typography.body, color: colors.textMuted },
  far: { ...typography.callout, color: 'rgba(43,39,36,0.22)' },
});
