import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing, typography } from '../design/tokens';
import { Text } from './Text';

export type SortOption<T extends string> = { value: T; label: string; testID?: string };

/**
 * 정렬 선택기(screens-b.md §1.1): 옵션 간격 16, subheadline, 선택은 textPrimary + 아래 1px 밑줄,
 * 비선택은 textInactive. 터치 영역은 텍스트 위 12 / 아래 22. 선택 애니메이션 없음.
 */
export function SortSelector<T extends string>({
  options,
  selected,
  onSelect,
  testID,
}: {
  options: SortOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  testID?: string;
}) {
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={styles.row}>
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option.value)}
            style={styles.item}
          >
            <View style={[styles.textBox, isSelected && styles.underline]}>
              <Text
                style={[
                  typography.subheadline,
                  { color: isSelected ? colors.textPrimary : colors.textInactive },
                ]}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg },
  item: { paddingTop: 12, paddingBottom: 18, minHeight: 44, justifyContent: 'center' },
  textBox: { paddingBottom: spacing.xs },
  underline: { borderBottomWidth: 1, borderBottomColor: colors.textPrimary },
});
