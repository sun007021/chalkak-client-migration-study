import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { WEEKDAY_HEADERS } from '../../../core/time/dateFormat';
import type { KstDate } from '../../../core/time/KstDate';
import { t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
import type { WeeklySection as WeeklyState } from '../HomeState';

type Props = {
  weekly: WeeklyState;
  onDayPress: (date: KstDate) => void;
  onMorePress: () => void;
  onRetry: () => void;
};

/** 이번 주 기록: 제목, N/7, 일~토 7칸. 사진은 기록이 있는 날만, PENDING 칸에는 "대기" 라벨. */
export function WeeklySection({ weekly, onDayPress, onMorePress, onRetry }: Props) {
  return (
    <View testID="home.week-section" style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('home.weekly.title')}</Text>
        {weekly.status === 'ready' ? (
          <Text testID="home.week-count" style={styles.count}>{`${weekly.count}/7`}</Text>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onMorePress} style={styles.more}>
          <Text style={styles.moreText}>{t('home.weekly.more')}</Text>
        </Pressable>
      </View>
      {weekly.status === 'error' ? (
        <View style={styles.error}>
          <Text testID="home.week-error" style={styles.errorText}>
            {t('home.weekly.error')}
          </Text>
          <Pressable testID="home.week-retry-button" accessibilityRole="button" onPress={onRetry}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {weekly.status === 'ready' ? (
        <View style={styles.days}>
          {weekly.days.map(({ date, entry }, index) => (
            <Pressable
              key={date.toString()}
              testID={`home.week-day-${date.toString()}`}
              accessibilityRole="button"
              onPress={() => onDayPress(date)}
              style={styles.day}
            >
              <Text style={styles.weekday}>{WEEKDAY_HEADERS[index]}</Text>
              <View style={styles.cell}>
                {entry?.thumbnailImageUrl ? (
                  <Image
                    testID={`home.week-photo-${date.toString()}`}
                    source={{ uri: entry.thumbnailImageUrl }}
                    style={styles.photo}
                  />
                ) : entry ? (
                  <View testID={`home.week-photo-${date.toString()}`} style={styles.photo} />
                ) : null}
              </View>
              <Text style={styles.dayNumber}>{String(date.day)}</Text>
              {entry?.status === 'PENDING' ? (
                <Text style={styles.pending}>{t('home.weekly.pending')}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  count: { flex: 1, fontSize: 14, color: colors.textSecondary },
  more: { marginLeft: 'auto' },
  moreText: { fontSize: 13, color: colors.accent },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: spacing.xs, width: 44 },
  weekday: { fontSize: 12, color: colors.textSecondary },
  cell: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photo: { width: 40, height: 40, backgroundColor: colors.border },
  dayNumber: { fontSize: 12, color: colors.textPrimary },
  pending: { fontSize: 10, color: colors.accent },
  error: { gap: spacing.xs },
  errorText: { color: colors.textSecondary },
  retryText: { color: colors.accent, fontWeight: '600' },
});
