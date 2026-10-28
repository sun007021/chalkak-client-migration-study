import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useViewModelState } from '../../../core/state/useViewModelState';
import { colors, spacing } from '../../../shared/ui/theme';
import type { AiReviewViewModel } from '../AiReviewViewModel';
import { AiReviewSheets } from './AiReviewSheets';

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
              style={styles.action}
            >
              <Text style={styles.actionText}>{card.action.label}</Text>
            </Pressable>
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

const styles = StyleSheet.create({
  root: {},
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  message: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  action: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  actionText: { color: colors.onOverlay, fontWeight: '600' },
});
