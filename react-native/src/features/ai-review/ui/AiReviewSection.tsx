import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useViewModelState } from '../../../core/state/useViewModelState';
import { t } from '../../../shared/copy';
import { colors, spacing, typography } from '../../../shared/design/tokens';
import type { AiPillKind } from '../AiReviewViewModelState';
import type { AiReviewViewModel } from '../AiReviewViewModel';
import { AiReviewSheets } from './AiReviewSheets';
import { AudioWaveIcon } from '../../../shared/ui/AudioWaveIcon';
import { Text } from '../../../shared/ui/Text';

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
          <AudioWaveIcon
            color={colors.textPrimary}
            animating={pill.kind === 'processing' || pill.kind === 'requesting'}
            scale={24 / 18}
          />
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

// 원본 근거: docs/design/screens-b.md §8.2 (캡슐 surfaceElevated + border 1, 최소 높이 44, 좌우 16, 웨이브 24 + 간격 8 + subheadline semibold).
const styles = StyleSheet.create({
  root: { gap: spacing.sm, alignItems: 'flex-start' },
  pill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  pillDisabled: { opacity: 0.7 },
  pillText: { ...typography.subheadline, fontWeight: '600', color: colors.textPrimary },
  notice: { gap: spacing.xs },
  noticeText: { ...typography.footnote, color: colors.textSecondary },
  recheck: { ...typography.footnote, fontWeight: '600', color: colors.actionPrimary },
});
