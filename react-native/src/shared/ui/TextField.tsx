import { useState, type Ref } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';
import { Text, TextInput, type TextInputRef } from './Text';

export type TextFieldProps = TextInputProps & {
  ref?: Ref<TextInputRef>;
  /** 있으면 오른쪽 아래에 "N / max" 카운터를 그린다. */
  counter?: { current: number; max: number };
  /** 카운터 testID. */
  counterTestID?: string;
};

/**
 * 원본 ChalkakTextField(screens-a.md §1.6): inputBackground, 라운드 14, 안쪽 16(카운터 있으면 아래 24 추가),
 * 테두리 1px(포커스 actionPrimary, 평소 border), 커서 inputCursor, 카운터 subheadline textInactive.
 */
export function TextField({
  counter,
  counterTestID,
  style,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.box,
        { borderColor: focused ? colors.actionPrimary : colors.border },
        counter ? styles.boxWithCounter : null,
      ]}
    >
      <TextInput
        ref={ref}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, style]}
      />
      {counter ? (
        <Text testID={counterTestID} style={styles.counter}>
          {counter.current} / {counter.max}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: spacing.lg,
    borderRadius: radius.input,
    borderWidth: 1,
    backgroundColor: colors.inputBackground,
  },
  boxWithCounter: { paddingBottom: spacing.lg + spacing.xl },
  input: { ...typography.body, padding: 0, color: colors.textPrimary },
  counter: {
    ...typography.subheadline,
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    color: colors.textInactive,
  },
});
