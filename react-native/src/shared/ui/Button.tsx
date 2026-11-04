import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';
import { Text } from './Text';

// 원본 근거: docs/design/screens-a.md §1.1·1.2 (ChalkakButton, ChalkakOutlinedButton). 가로 24, 세로 17, 라운드 12.
const VERTICAL_PADDING = 17;
const DISABLED_CONTAINER = 'rgba(43,39,36,0.12)'; // actionPrimary 12%
const RIPPLE = 'rgba(43,39,36,0.12)';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  /** 기본 true: 부모 폭을 채운다. */
  fillsWidth?: boolean;
  verticalPadding?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** 진행 중이면 라벨 앞에 작은 스피너를 보인다(busyTestID가 그 요소의 testID). */
  busy?: boolean;
  busyTestID?: string;
};

/** 주 버튼: actionPrimary 바탕 + 흰 글자. 비활성은 actionPrimary 12% 바탕 + textPrimary 글자. */
export function ChalkakButton({
  label,
  onPress,
  testID,
  disabled = false,
  fillsWidth = true,
  verticalPadding = VERTICAL_PADDING,
  accessibilityLabel,
  style,
  busy,
  busyTestID,
}: ButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.18)' }}
      style={({ pressed }) => [
        styles.base,
        { paddingVertical: verticalPadding },
        fillsWidth && styles.fill,
        disabled ? styles.disabled : styles.enabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          testID={busyTestID}
          size="small"
          color={disabled ? colors.textPrimary : colors.onActionPrimary}
        />
      ) : null}
      <Text
        style={[styles.label, { color: disabled ? colors.textPrimary : colors.onActionPrimary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 아웃라인 버튼: 투명 바탕 + 1px border 테두리(활성·비활성 동일). 비활성 글자는 textMuted. */
export function ChalkakOutlinedButton({
  label,
  onPress,
  testID,
  disabled = false,
  fillsWidth = true,
  verticalPadding = VERTICAL_PADDING,
  accessibilityLabel,
  style,
}: ButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ color: RIPPLE }}
      style={({ pressed }) => [
        styles.base,
        styles.outlined,
        { paddingVertical: verticalPadding },
        fillsWidth && styles.fill,
        pressed && !disabled && styles.pressedOutline,
        style,
      ]}
    >
      <Text style={[styles.label, { color: disabled ? colors.textMuted : colors.textPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    overflow: 'hidden',
  },
  fill: { alignSelf: 'stretch' },
  enabled: { backgroundColor: colors.actionPrimary },
  disabled: { backgroundColor: DISABLED_CONTAINER },
  outlined: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  pressed: { opacity: 0.88 },
  pressedOutline: { backgroundColor: 'rgba(43,39,36,0.04)' },
  label: { ...typography.callout, textAlign: 'center' },
});
