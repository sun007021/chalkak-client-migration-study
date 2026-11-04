import { Pressable } from 'react-native';

import { Icon } from './icons/Icon';

const SIZE = 22; // screens-a.md §1.5: 22x22, 원본 색 그대로, 애니메이션 없음(즉시 교체)

export type CheckboxProps = {
  checked: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
};

export function Checkbox({ checked, onPress, testID, accessibilityLabel }: CheckboxProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked }}
      hitSlop={11}
      onPress={onPress}
    >
      <Icon name={checked ? 'ic_checkbox_selected' : 'ic_checkbox_unselected'} size={SIZE} />
    </Pressable>
  );
}
