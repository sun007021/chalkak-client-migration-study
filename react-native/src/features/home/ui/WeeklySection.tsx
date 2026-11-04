import { Pressable, StyleSheet, View } from 'react-native';

import { WEEKDAY_HEADERS } from '../../../core/time/dateFormat';
import type { KstDate } from '../../../core/time/KstDate';
import { t } from '../../../shared/copy';
import { colors, pretendardFor, radius, spacing, typography } from '../../../shared/design/tokens';
import { RemoteImage } from '../../../shared/ui/RemoteImage';
import { RoundIconButton } from '../../../shared/ui/RoundIconButton';
import { Skeleton } from '../../../shared/ui/Skeleton';
import { Text } from '../../../shared/ui/Text';
import type { WeeklySection as WeeklyState } from '../HomeState';
import { SectionHeader } from './SectionHeader';

type Props = {
  weekly: WeeklyState;
  onDayPress: (date: KstDate) => void;
  onMorePress: () => void;
  onRetry: () => void;
};

// 원본 HomeWeeklyRecord(screens-a.md §7.6): 헤더 아래 간격 16, 셀 7개 간격 8, 정사각, 라운드 small(7), calendarCell 바탕.
// 사진이 없으면 셀 안에 요일 기호(caption textSecondary), 검수 대기는 아래 띠 "대기".
const CELL_COUNT = 7;

/** 이번 주 기록: 제목, N/7, 일~토 7칸. 사진은 기록이 있는 날만, PENDING 칸에는 "대기" 띠. */
export function WeeklySection({ weekly, onDayPress, onMorePress, onRetry }: Props) {
  return (
    <View testID="home.week-section" style={styles.root}>
      <SectionHeader
        title={t('home.weekly.title')}
        suffix={weekly.status === 'ready' ? `${weekly.count}/7` : undefined}
        suffixTestID="home.week-count"
        moreLabel={t('home.weekly.more')}
        onMorePress={onMorePress}
      />
      {weekly.status === 'loading' ? (
        <View style={styles.days}>
          {Array.from({ length: CELL_COUNT }, (_, i) => (
            <Skeleton key={i} style={styles.cell} />
          ))}
        </View>
      ) : null}
      {weekly.status === 'error' ? (
        <View style={styles.error}>
          <Text testID="home.week-error" style={styles.errorText}>
            {t('home.weekly.error')}
          </Text>
          <RoundIconButton
            testID="home.week-retry-button"
            accessibilityLabel={t('common.retry')}
            size={32}
            iconSize={15}
            onPress={onRetry}
          />
        </View>
      ) : null}
      {weekly.status === 'ready' ? (
        <View style={styles.days}>
          {weekly.days.map(({ date, entry }, index) => (
            <Pressable
              key={date.toString()}
              testID={`home.week-day-${date.toString()}`}
              accessibilityRole="button"
              accessibilityLabel={`${WEEKDAY_HEADERS[index]} ${date.day}`}
              onPress={() => onDayPress(date)}
              style={styles.cell}
            >
              {entry ? (
                <View testID={`home.week-photo-${date.toString()}`} style={StyleSheet.absoluteFill}>
                  <RemoteImage uri={entry.thumbnailImageUrl} style={StyleSheet.absoluteFill} />
                </View>
              ) : (
                <Text style={styles.weekday}>{WEEKDAY_HEADERS[index]}</Text>
              )}
              {entry?.status === 'PENDING' ? (
                <View style={styles.pendingBand}>
                  <Text style={styles.pendingText}>{t('home.weekly.pending')}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  days: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.screenHorizontal },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.small,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.calendarCell,
  },
  weekday: { ...typography.caption, color: colors.textSecondary },
  pendingBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 1,
    alignItems: 'center',
    backgroundColor: colors.scrim,
  },
  pendingText: {
    ...typography.caption,
    fontFamily: pretendardFor('600'),
    color: colors.textOnImage,
    textAlign: 'center',
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.screenHorizontal,
    minHeight: 48,
  },
  errorText: { ...typography.footnote, color: colors.textSecondary },
});
