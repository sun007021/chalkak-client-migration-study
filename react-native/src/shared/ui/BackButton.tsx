import { Pressable, StyleSheet } from 'react-native';

import { colors } from '../design/tokens';
import { Icon } from './icons/Icon';

export type BackButtonProps = {
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  /** 닫기(X) 모양. 기본은 뒤로(←). */
  variant?: 'back' | 'close';
};

/** 상단 뒤로/닫기 버튼. 터치 48(screens-a.md §1.3), 아이콘은 ic_arrow_back / ic_close 24, iconPrimary. */
export function BackButton({
  onPress,
  testID,
  accessibilityLabel,
  variant = 'back',
}: BackButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (variant === 'close' ? '닫기' : '뒤로 가기')}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon
        name={variant === 'close' ? 'ic_close' : 'ic_arrow_back'}
        size={24}
        color={colors.iconPrimary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
