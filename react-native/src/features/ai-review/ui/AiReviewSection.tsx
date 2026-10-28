import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useViewModelState } from '../../../core/state/useViewModelState';
import { t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import type { AiPillKind } from '../AiReviewViewModelState';
import type { AiReviewViewModel } from '../AiReviewViewModel';
import { AiReviewSheets } from './AiReviewSheets';

const PILL_TEST_IDS: Record<AiPillKind, string> = {
  checking: 'feed.ai-checking',
  request: 'feed.ai-request-button',
  requesting: 'feed.ai-requesting',
  processing: 'feed.ai-processing',
  view: 'feed.ai-result-button',
  retry: 'feed.ai-retry-button',
  failed: 'feed.ai-failed-button',
  recheck: 'feed.ai-recheck-button',
};

/** 상세의 AI 피드백 알약, 안내, 시트. 마운트 = onShown, 언마운트 = onHidden(ViewModel의 생성·dispose는 소유자). */
export function AiReviewSection({ viewModel }: { viewModel: AiReviewViewModel }) {
  const state = useViewModelState(viewModel);

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  const { pill, notice } = state;
  return (
    <View style={styles.root}>
      {pill ? (
        <Pressable
          testID={PILL_TEST_IDS[pill.kind]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !pill.enabled }}
          disabled={!pill.enabled}
          onPress={() => viewModel.onPillPress()}
          style={[styles.pill, !pill.enabled && styles.pillDisabled]}
        >
          <Text style={styles.pillText}>{pill.label}</Text>
        </Pressable>
      ) : null}
      {notice ? (
        <View style={styles.notice}>
          <Text testID="feed.ai-message" style={styles.noticeText}>
            {notice.message}
          </Text>
          {notice.canRecheck ? (
            <Pressable
              testID="feed.ai-recheck-button"
              accessibilityRole="button"
              onPress={() => viewModel.onRecheckPress()}
              hitSlop={8}
            >
              <Text style={styles.recheck}>{t('ai.pill.recheck')}</Text>
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

const styles = StyleSheet.create({
  root: { gap: spacing.sm, alignItems: 'flex-start' },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  pillDisabled: { backgroundColor: colors.textSecondary },
  pillText: { color: colors.onOverlay, fontWeight: '600' },
  notice: { gap: spacing.xs },
  noticeText: { fontSize: 13, color: colors.textSecondary },
  recheck: { fontSize: 13, fontWeight: '600', color: colors.accent },
});
