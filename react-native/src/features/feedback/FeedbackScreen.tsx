import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { FEEDBACK_MAX } from '../../shared/constants';
import { t } from '../../shared/copy';
import { colors, spacing } from '../../shared/ui/theme';
import type { FeedbackViewModel } from './FeedbackViewModel';

/**
 * 피드백 작성 화면. testID는 testids.md의 feedback.*. 상태는 구독만 하고 screen_view는 보내지 않는다
 * (소유자가 start()로 보낸다). 입력은 1000자에서 막지 않고 보내기 시점에 검증한다(REQ-FDBK-005).
 */
export function FeedbackScreen({ viewModel }: { viewModel: FeedbackViewModel }) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      testID="feedback.root"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('fdbk.title')}</Text>
        <Pressable
          testID="feedback.close-button"
          accessibilityRole="button"
          onPress={() => viewModel.close()}
          hitSlop={12}
        >
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text testID="feedback.guide-text" style={styles.guide}>
          {t('fdbk.intro.title')}
        </Text>
        <Text testID="feedback.guide-body" style={styles.guideBody}>
          {t('fdbk.intro.body')}
        </Text>
        <Text style={styles.label}>{t('fdbk.field.label')}</Text>
        <TextInput
          testID="feedback.input"
          value={state.text}
          onChangeText={(text) => viewModel.onTextChange(text)}
          placeholder={t('fdbk.field.placeholder')}
          multiline
          textAlignVertical="top"
          style={styles.input}
        />
        <Text testID="feedback.counter" style={styles.counter}>
          {`${state.count}/${FEEDBACK_MAX}`}
        </Text>
        {state.validationMessage !== null ? (
          <Text testID="feedback.validation-message" style={styles.error}>
            {state.validationMessage}
          </Text>
        ) : null}
        {state.errorMessage !== null ? (
          <Text testID="feedback.error-message" style={styles.error}>
            {state.errorMessage}
          </Text>
        ) : null}
      </ScrollView>
      <Pressable
        testID="feedback.submit-button"
        accessibilityRole="button"
        accessibilityState={{ disabled: !state.canSubmit }}
        disabled={!state.canSubmit}
        onPress={() => void viewModel.submit()}
        style={[styles.submit, !state.canSubmit && styles.submitDisabled]}
      >
        <Text style={styles.submitText}>{state.sending ? t('fdbk.sending') : t('fdbk.send')}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  close: { fontSize: 20, color: colors.textPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  guide: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, lineHeight: 28 },
  guideBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  label: { fontSize: 14, color: colors.textSecondary },
  input: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  counter: { alignSelf: 'flex-end', fontSize: 13, color: colors.textSecondary },
  error: { fontSize: 14, color: colors.danger },
  submit: {
    margin: spacing.lg,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
