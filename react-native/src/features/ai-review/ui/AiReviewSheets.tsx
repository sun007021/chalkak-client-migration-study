import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { t } from '../../../shared/copy';
import { colors, radius, spacing, typography } from '../../../shared/design/tokens';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { ChalkakButton } from '../../../shared/ui/Button';
import { Dialog, DialogButton } from '../../../shared/ui/Dialog';
import { Icon } from '../../../shared/ui/icons/Icon';
import type { IconName } from '../../../shared/ui/icons/iconData';
import { Text } from '../../../shared/ui/Text';
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

// 시작 안내 줄의 아이콘(screens-b.md §7.2: ic_clock / ic_smartphone / ic_bell).
const START_ICONS: IconName[] = ['ic_clock', 'ic_smartphone', 'ic_bell'];
const RING_SIZE = 84;
const RING_STROKE = 8;

function ScoreRing({ scoreText, a11yLabel }: { scoreText: string; a11yLabel: string }) {
  const progress = Math.min(1, Math.max(0, Number.parseFloat(scoreText) / 10 || 0));
  const radiusPx = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radiusPx}
          stroke={colors.calendarCell}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radiusPx}
          stroke={colors.actionPrimary}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text
        testID="ai-result-sheet.overall-score"
        accessibilityLabel={a11yLabel}
        style={styles.score}
      >
        {scoreText}
      </Text>
    </View>
  );
}

function StartSheet({ sheet, viewModel }: { sheet: AiStartSheet; viewModel: AiReviewViewModel }) {
  return (
    <BottomSheet
      testID="ai-start-sheet.root"
      height={360}
      onRequestClose={() => viewModel.dismissSheet()}
    >
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {sheet.title}
        </Text>
        <View testID="ai-start-sheet.description" style={styles.infoBox}>
          {sheet.lines.map((line, index) => (
            <View key={line} style={styles.infoLine}>
              <View style={styles.infoIcon}>
                <Icon
                  name={START_ICONS[index] ?? 'ic_clock'}
                  size={18}
                  color={colors.iconSecondary}
                />
              </View>
              <Text style={styles.infoText}>{line}</Text>
            </View>
          ))}
        </View>
        <ChalkakButton
          testID="ai-start-sheet.start-button"
          label={sheet.confirmLabel}
          onPress={() => void viewModel.confirmStart()}
        />
        <Pressable
          testID="ai-start-sheet.close-button"
          accessibilityRole="button"
          onPress={() => viewModel.dismissSheet()}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{t('common.close')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
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
    <BottomSheet testID="ai-result-sheet.root" onRequestClose={() => viewModel.dismissSheet()}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {sheet.distinctiveBadge ? (
          <View style={styles.badge}>
            <Icon name="ic_aperture" size={14} color={colors.onActionPrimary} />
            <Text testID="ai-result-sheet.distinctive-badge" style={styles.badgeText}>
              {sheet.distinctiveBadge}
            </Text>
          </View>
        ) : null}
        <View style={styles.summaryRow}>
          <Text testID="ai-result-sheet.feedback-summary" style={styles.summary}>
            {sheet.summary}
          </Text>
          <ScoreRing scoreText={sheet.scoreText} a11yLabel={sheet.scoreA11yLabel} />
        </View>
        {sheet.criteria.length > 0 ? (
          <View style={styles.criteria}>
            {sheet.criteria.map((c) => (
              <View
                key={c.key}
                testID={`ai-result-sheet.criteria-item-${c.key}`}
                style={styles.criteriaRow}
              >
                <Text style={styles.sectionBody}>{c.label}</Text>
                <Text style={styles.criteriaScore}>{c.scoreText}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.divider} />
        {sheet.sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text testID={SECTION_TEST_IDS[section.key]} style={styles.sectionBody}>
              {section.body}
            </Text>
          </View>
        ))}
        <Pressable
          testID="ai-result-sheet.criteria-info-button"
          accessibilityRole="button"
          accessibilityLabel={t('ai.result.criteria-help')}
          onPress={() => viewModel.openCriteriaDialog()}
          style={styles.criteriaLink}
        >
          <Text style={styles.criteriaLinkText}>{t('ai.result.criteria-help')}</Text>
        </Pressable>
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
        <Dialog
          testID="ai-result-sheet.criteria-dialog"
          title={t('ai.result.criteria-dialog-title')}
          onRequestClose={() => viewModel.closeCriteriaDialog()}
          actions={
            <DialogButton
              testID="ai-result-sheet.criteria-close-button"
              label={t('common.close')}
              onPress={() => viewModel.closeCriteriaDialog()}
            />
          }
        />
      ) : null}
    </BottomSheet>
  );
}

function FailedSheet({ sheet, viewModel }: { sheet: AiFailedSheet; viewModel: AiReviewViewModel }) {
  return (
    <BottomSheet testID="ai-failed-sheet.root" onRequestClose={() => viewModel.dismissSheet()}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.headline}>
          {sheet.title}
        </Text>
        {sheet.reason ? (
          <Text testID="ai-failed-sheet.message" style={styles.reason}>
            {sheet.reason}
          </Text>
        ) : null}
        {sheet.canRetry ? (
          <ChalkakButton
            testID="ai-failed-sheet.retry-button"
            label={t('ai.pill.retry')}
            onPress={() => viewModel.onFailedSheetRetry()}
          />
        ) : null}
        <ChalkakButton
          testID="ai-failed-sheet.confirm-button"
          label={sheet.confirmLabel}
          onPress={() => viewModel.dismissSheet()}
        />
      </View>
    </BottomSheet>
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

// 원본 근거: docs/design/screens-b.md §7.2~7.3, §8.3 (제목 title3, 안내 박스 background/large/16, 36 원 아이콘, 점수 링 84/8, 문단 footnote/subheadline).
const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  scroll: { gap: spacing.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  title: { ...typography.title3, color: colors.textPrimary },
  headline: { ...typography.headline, color: colors.textPrimary },
  reason: { ...typography.body, color: colors.textSecondary },
  infoBox: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.large,
    backgroundColor: colors.background,
  },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  infoText: { ...typography.subheadline, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summary: { ...typography.title3, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  score: { ...typography.title1, color: colors.textPrimary },
  criteria: { gap: spacing.sm },
  criteriaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  criteriaScore: { ...typography.subheadline, color: colors.textPrimary },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.small,
    backgroundColor: colors.actionPrimary,
  },
  badgeText: { ...typography.caption, fontWeight: '600', color: colors.onActionPrimary },
  divider: { height: 1, backgroundColor: colors.border },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.footnote, fontWeight: '600', color: colors.textPrimary },
  sectionBody: { ...typography.subheadline, color: colors.textSecondary },
  criteriaLink: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center' },
  criteriaLinkText: {
    ...typography.caption,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  secondaryText: { ...typography.subheadline, color: colors.textSecondary },
});
