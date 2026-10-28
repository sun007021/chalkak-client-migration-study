import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import type {
  AiFailedSheet,
  AiResultSheet,
  AiSheet,
  AiStartSheet,
} from '../AiReviewViewModelState';
import type { AiReviewViewModel } from '../AiReviewViewModel';

const SECTION_TEST_IDS = {
  strength: 'ai-result-sheet.feedback-strength',
  weakness: 'ai-result-sheet.feedback-weakness',
  suggestion: 'ai-result-sheet.feedback-suggestion',
} as const;

function SheetFrame({
  testID,
  onClose,
  children,
}: {
  testID: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View testID={testID} style={styles.sheet}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function StartSheet({ sheet, viewModel }: { sheet: AiStartSheet; viewModel: AiReviewViewModel }) {
  return (
    <SheetFrame testID="ai-start-sheet.root" onClose={() => viewModel.dismissSheet()}>
      <Text accessibilityRole="header" style={styles.title}>
        {sheet.title}
      </Text>
      <View testID="ai-start-sheet.description" style={styles.lines}>
        {sheet.lines.map((line) => (
          <Text key={line} style={styles.body}>
            {line}
          </Text>
        ))}
      </View>
      <Pressable
        testID="ai-start-sheet.start-button"
        accessibilityRole="button"
        onPress={() => void viewModel.confirmStart()}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>{sheet.confirmLabel}</Text>
      </Pressable>
      <Pressable
        testID="ai-start-sheet.close-button"
        accessibilityRole="button"
        onPress={() => viewModel.dismissSheet()}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>{t('common.close')}</Text>
      </Pressable>
    </SheetFrame>
  );
}

function ResultSheet({
  sheet,
  criteriaDialogOpen,
  viewModel,
}: {
  sheet: AiResultSheet;
  criteriaDialogOpen: boolean;
  viewModel: AiReviewViewModel;
}) {
  return (
    <SheetFrame testID="ai-result-sheet.root" onClose={() => viewModel.dismissSheet()}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          testID="ai-result-sheet.criteria-info-button"
          accessibilityRole="button"
          accessibilityLabel={t('ai.result.criteria-help')}
          onPress={() => viewModel.openCriteriaDialog()}
        >
          <Text
            testID="ai-result-sheet.overall-score"
            accessibilityLabel={sheet.scoreA11yLabel}
            style={styles.score}
          >
            {sheet.scoreText}
          </Text>
          <Text style={styles.hint}>{t('ai.result.criteria-help')}</Text>
        </Pressable>
        {sheet.criteria.map((c) => (
          <View key={c.key} testID={`ai-result-sheet.criteria-item-${c.key}`} style={styles.row}>
            <Text style={styles.body}>{c.label}</Text>
            <Text style={styles.body}>{c.scoreText}</Text>
          </View>
        ))}
        {sheet.distinctiveBadge ? (
          <Text testID="ai-result-sheet.distinctive-badge" style={styles.badge}>
            {sheet.distinctiveBadge}
          </Text>
        ) : null}
        <Text testID="ai-result-sheet.feedback-summary" style={styles.summary}>
          {sheet.summary}
        </Text>
        {sheet.sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text testID={SECTION_TEST_IDS[section.key]} style={styles.body}>
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Pressable
        testID="ai-result-sheet.close-button"
        accessibilityRole="button"
        onPress={() => viewModel.dismissSheet()}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>{t('common.close')}</Text>
      </Pressable>
      {criteriaDialogOpen ? (
        <Modal transparent animationType="fade" visible>
          <View style={styles.backdropCenter}>
            <View testID="ai-result-sheet.criteria-dialog" style={styles.dialog}>
              <Text accessibilityRole="header" style={styles.title}>
                {t('ai.result.criteria-dialog-title')}
              </Text>
              <Pressable
                testID="ai-result-sheet.criteria-close-button"
                accessibilityRole="button"
                onPress={() => viewModel.closeCriteriaDialog()}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>{t('common.close')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </SheetFrame>
  );
}

function FailedSheet({ sheet, viewModel }: { sheet: AiFailedSheet; viewModel: AiReviewViewModel }) {
  return (
    <SheetFrame testID="ai-failed-sheet.root" onClose={() => viewModel.dismissSheet()}>
      <Text accessibilityRole="header" style={styles.title}>
        {sheet.title}
      </Text>
      {sheet.reason ? (
        <Text testID="ai-failed-sheet.message" style={styles.body}>
          {sheet.reason}
        </Text>
      ) : null}
      {sheet.canRetry ? (
        <Pressable
          testID="ai-failed-sheet.retry-button"
          accessibilityRole="button"
          onPress={() => viewModel.onFailedSheetRetry()}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>{t('ai.pill.retry')}</Text>
        </Pressable>
      ) : null}
      <Pressable
        testID="ai-failed-sheet.confirm-button"
        accessibilityRole="button"
        onPress={() => viewModel.dismissSheet()}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>{sheet.confirmLabel}</Text>
      </Pressable>
    </SheetFrame>
  );
}

/** 시작·결과·실패 시트 중 열려 있는 하나. 닫으면 요청은 없다. */
export function AiReviewSheets({
  sheet,
  criteriaDialogOpen,
  viewModel,
}: {
  sheet: AiSheet | null;
  criteriaDialogOpen: boolean;
  viewModel: AiReviewViewModel;
}) {
  if (!sheet) return null;
  if (sheet.kind === 'start') return <StartSheet sheet={sheet} viewModel={viewModel} />;
  if (sheet.kind === 'failed') return <FailedSheet sheet={sheet} viewModel={viewModel} />;
  return (
    <ResultSheet sheet={sheet} criteriaDialogOpen={criteriaDialogOpen} viewModel={viewModel} />
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  backdropCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    padding: spacing.xl,
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    gap: spacing.md,
  },
  dialog: {
    alignSelf: 'stretch',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.xl,
    gap: spacing.md,
  },
  scroll: { gap: spacing.md },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  lines: { gap: spacing.xs },
  body: { fontSize: 14, color: colors.textPrimary },
  hint: { fontSize: 12, color: colors.textSecondary },
  score: { fontSize: 40, fontWeight: '800', color: colors.accent },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  badge: { fontSize: 13, fontWeight: '600', color: colors.accent },
  summary: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  primary: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.accent,
  },
  primaryText: { color: colors.onOverlay, fontWeight: '700' },
  secondary: { alignItems: 'center', paddingVertical: spacing.md },
  secondaryText: { color: colors.textSecondary, fontWeight: '600' },
});
