import { type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, typography } from '../design/tokens';
import { Text } from './Text';

// 원본 근거: docs/design/screens-b.md §1.6 (ChalkakConfirmDialog). 폭 81%, 라운드 16, surfaceElevated,
// 안쪽 좌우 40 / 위 24 / 아래 26, 제목 title3, 메시지 callout textNeutral, 버튼 간격 10, 라운드 12, 세로 9.5.
const WIDTH_RATIO = '81%';

export type DialogProps = {
  title: string;
  message?: string;
  /** 메시지 대신 넣을 내용(입력 칸 등). */
  children?: ReactNode;
  onRequestClose: () => void;
  testID?: string;
  /** 버튼 줄. DialogButton을 넘긴다. */
  actions: ReactNode;
  messageTestID?: string;
  titleTestID?: string;
};

export function Dialog({
  title,
  message,
  children,
  onRequestClose,
  testID,
  actions,
  messageTestID,
  titleTestID,
}: DialogProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View testID={testID} style={styles.scrim}>
        <View style={styles.card} accessibilityViewIsModal>
          {title ? (
            <Text testID={titleTestID} style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {message ? (
            <Text testID={messageTestID} style={styles.message}>
              {message}
            </Text>
          ) : null}
          {children}
          <View style={styles.actions}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

export type DialogButtonProps = {
  label: string;
  onPress: () => void;
  testID?: string;
  /** cancel: 회색 / primary: 짙은 색 / destructive: 빨강. */
  tone?: 'cancel' | 'primary' | 'destructive';
  disabled?: boolean;
  /** 진행 중이면 스피너를 보인다(busyTestID가 그 요소의 testID). */
  busy?: boolean;
  busyTestID?: string;
};

export function DialogButton({
  label,
  onPress,
  testID,
  tone = 'primary',
  disabled,
  busy,
  busyTestID,
}: DialogButtonProps) {
  const background =
    tone === 'cancel'
      ? colors.actionSecondary
      : tone === 'destructive'
        ? colors.destructive
        : colors.actionPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator testID={busyTestID} size="small" color={colors.onActionPrimary} />
      ) : null}
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  card: {
    width: WIDTH_RATIO,
    maxWidth: 420,
    alignItems: 'center',
    borderRadius: radius.large,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 26,
  },
  title: { ...typography.title3, color: colors.textPrimary, textAlign: 'center' },
  message: {
    ...typography.callout,
    marginTop: 8,
    color: colors.textNeutral,
    textAlign: 'center',
  },
  actions: { marginTop: 23, flexDirection: 'row', alignSelf: 'stretch', gap: 10 },
  button: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    paddingVertical: 9.5,
  },
  buttonLabel: { ...typography.callout, color: colors.onActionPrimary, textAlign: 'center' },
});
