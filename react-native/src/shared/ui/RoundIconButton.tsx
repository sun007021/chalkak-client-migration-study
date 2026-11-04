import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../design/tokens';
import { Icon } from './icons/Icon';

export type RoundIconButtonProps = {
  onPress: () => void;
  testID?: string;
  accessibilityLabel: string;
  /** 지름. 홈 히어로 40, 주간 기록 32, 전시 오류 48(screens-a.md §7.4·7.6, screens-b.md §2.4). */
  size?: number;
  iconSize?: number;
};

/** 재시도용 둥근 새로고침 버튼: actionPrimary 원 + 흰 아이콘. 터치 영역은 최소 44. */
export function RoundIconButton({
  onPress,
  testID,
  accessibilityLabel,
  size = 40,
  iconSize = 18,
}: RoundIconButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={Math.max(0, (44 - size) / 2)}
      style={({ pressed }) => [
        styles.base,
        { width: size, height: size, borderRadius: size / 2, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Icon name="ic_rotate_right" size={iconSize} color={colors.onActionPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionPrimary },
});
