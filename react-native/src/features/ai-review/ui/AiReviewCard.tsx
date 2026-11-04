import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useViewModelState } from '../../../core/state/useViewModelState';
import { colors, radius, spacing, typography } from '../../../shared/design/tokens';
import { AudioWaveIcon } from '../../../shared/ui/AudioWaveIcon';
import { Icon } from '../../../shared/ui/icons/Icon';
import type { AiReviewViewModel } from '../AiReviewViewModel';
import { AiReviewSheets } from './AiReviewSheets';
import { Text } from '../../../shared/ui/Text';

const ACTION_TEST_IDS = {
  start: 'home.ai-request-button',
  detail: 'home.ai-detail-button',
  retry: 'home.ai-retry-button',
} as const;

/** 홈 AI 피드백 카드. testID는 상태를 나타내는 요소(진행 중·완료·실패)가 그 상태일 때만 존재한다. */
export function AiReviewCard({ viewModel }: { viewModel: AiReviewViewModel }) {
  const state = useViewModelState(viewModel);

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  const { card } = state;
  const busy = state.pill?.kind === 'processing' || state.pill?.kind === 'requesting';
  return (
    <View style={styles.root}>
      {card ? (
        <View style={styles.card}>
          <Text
            testID={messageTestId(card.action?.kind ?? null, state.pill?.kind)}
            style={styles.message}
          >
            {card.message}
          </Text>
          {card.action ? (
            <Pressable
              testID={ACTION_TEST_IDS[card.action.kind]}
              accessibilityRole="button"
              onPress={() => void viewModel.onCardActionPress()}
              style={({ pressed }) => [
                card.action?.kind === 'start' ? styles.startAction : styles.textAction,
                pressed && styles.pressed,
              ]}
            >
              <Text style={card.action.kind === 'start' ? styles.startText : styles.actionText}>
                {card.action.label}
              </Text>
              {card.action.kind === 'detail' ? (
                <Icon name="ic_chevron_down" size={16} color={colors.iconSecondary} />
              ) : null}
            </Pressable>
          ) : busy ? (
            <View style={styles.waveCircle}>
              <AudioWaveIcon color={colors.onActionPrimary} animating />
            </View>
          ) : null}
        </View>
      ) : null}
      <AiReviewSheets
        sheet={state.sheet}
        criteriaDialogOpen={state.criteriaDialogOpen}
        viewModel={viewModel}
      />
    </View>
  );
}

function messageTestId(
  action: 'start' | 'detail' | 'retry' | null,
  pill: string | undefined,
): string | undefined {
  if (pill === 'processing' || pill === 'requesting') return 'home.ai-processing';
  if (pill === 'view' || action === 'detail') return 'home.ai-completed';
  if (pill === 'failed' || pill === 'retry') return 'home.ai-failed';
  return undefined;
}

// 원본 근거: docs/design/screens-a.md §7.5, screens-b.md §8.1 (카드 18 + border 1, 그림자 actionPrimary 0.08/12/y5, 헤더 최소 64).
const styles = StyleSheet.create({
  root: {},
  card: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.xlarge,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    shadowColor: colors.actionPrimary,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  message: { ...typography.callout, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  pressed: { opacity: 0.8 },
  startAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.actionPrimary,
  },
  startText: { ...typography.footnote, color: colors.onActionPrimary },
  textAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { ...typography.footnote, color: colors.textSecondary },
  waveCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.actionPrimary,
  },
});
