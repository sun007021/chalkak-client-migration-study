import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { FEEDBACK_MAX } from '../../shared/constants';
import { t } from '../../shared/copy';
import { colors, spacing, typography } from '../../shared/design/tokens';
import { BackButton } from '../../shared/ui/BackButton';
import { ChalkakButton } from '../../shared/ui/Button';
import { Text } from '../../shared/ui/Text';
import { TextField } from '../../shared/ui/TextField';
import type { FeedbackViewModel } from './FeedbackViewModel';

/**
 * 피드백 작성 화면. testID는 testids.md의 feedback.*. 상태는 구독만 하고 screen_view는 보내지 않는다
 * (소유자가 start()로 보낸다). 입력은 1000자에서 막지 않고 보내기 시점에 검증한다(REQ-FDBK-005).
 * 레이아웃은 docs/design/screens-c.md §5.2 (제목 title2, 설명 subheadline, 입력 높이 240, 하단 고정 보내기 버튼).
 */
export function FeedbackScreen({ viewModel }: { viewModel: FeedbackViewModel }) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      testID="feedback.root"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <BackButton
          testID="feedback.close-button"
          variant="close"
          accessibilityLabel={t('common.close')}
          onPress={() => viewModel.close()}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text testID="feedback.guide-text" style={styles.guide}>
          {t('fdbk.intro.title')}
        </Text>
        <Text testID="feedback.guide-body" style={styles.guideBody}>
          {t('fdbk.intro.body')}
        </Text>
        <View style={styles.field}>
          <TextField
            testID="feedback.input"
            accessibilityLabel={t('fdbk.field.label')}
            value={state.text}
            onChangeText={(text) => viewModel.onTextChange(text)}
            placeholder={t('fdbk.field.placeholder')}
            multiline
            editable={!state.sending}
            textAlignVertical="top"
            counterText={`${state.count} / ${FEEDBACK_MAX}`}
            counterTestID="feedback.counter"
            style={styles.input}
          />
        </View>
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
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <ChalkakButton
          testID="feedback.submit-button"
          label={state.sending ? t('fdbk.sending') : t('fdbk.send')}
          disabled={!state.canSubmit}
          onPress={() => void viewModel.submit()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { alignItems: 'flex-end', paddingHorizontal: spacing.md },
  content: { paddingHorizontal: spacing.screenHorizontal, paddingTop: spacing.xl },
  guide: { ...typography.title2, color: colors.textPrimary },
  guideBody: { ...typography.subheadline, color: colors.textSecondary, marginTop: spacing.md },
  field: { marginTop: 28 },
  input: { ...typography.subheadline, minHeight: 240 - 2 * spacing.lg - spacing.xl },
  error: { ...typography.footnote, color: colors.error, marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
  },
});
