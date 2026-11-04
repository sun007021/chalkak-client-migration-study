import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { KstDate } from '../../../core/time/KstDate';
import { format, t } from '../../../shared/copy';
import { colors, spacing, typography } from '../../../shared/design/tokens';
import { BottomSheet } from '../../../shared/ui/BottomSheet';
import { ChalkakButton } from '../../../shared/ui/Button';
import { Text } from '../../../shared/ui/Text';
import { WheelPicker } from '../../../shared/ui/WheelPicker';
import {
  availableDays,
  availableMonths,
  availableYears,
  resolvePickedDate,
  type DateRange,
} from '../displayDateRange';

type Props = {
  range: DateRange;
  initial: KstDate;
  onConfirm: (date: KstDate) => void;
  onClose: () => void;
};

/** 목록에서 가장 가까운 값. 연·월을 바꿨을 때 고를 수 없게 된 월·일을 범위 안으로 맞춘다. */
function nearest(options: readonly number[], value: number): number {
  if (options.includes(value)) return value;
  return value < options[0] ? options[0] : options[options.length - 1];
}

/**
 * "날짜 선택" 시트: 연·월·일 세 휠에서 하한~상한 안의 값만 고른다. 마운트될 때마다 현재 날짜에서 시작한다.
 * 원본 피커 시트(screens-b.md §1.2): 위 모서리 28, 안쪽 좌우 24, 제목 title3 왼쪽, 휠, 아래 큰 확인 버튼.
 */
export function DatePickerSheet({ range, initial, onConfirm, onClose }: Props) {
  const [picked, setPicked] = useState({
    year: initial.year,
    month: initial.month,
    day: initial.day,
  });
  const years = availableYears(range);
  const year = nearest(years, picked.year);
  const months = availableMonths(range, year);
  const month = nearest(months, picked.month);
  const days = availableDays(range, year, month);
  const day = nearest(days, picked.day);

  return (
    <BottomSheet testID="display.date-picker-sheet" onRequestClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('display.picker.title')}</Text>
        <View style={styles.wheels}>
          <WheelPicker
            testID="display.date-picker-year"
            accessibilityLabel="연도"
            values={years}
            selected={year}
            label={(n) => format(t('display.picker.year'), { n })}
            onSelect={(value) => setPicked({ ...picked, year: value })}
          />
          <WheelPicker
            testID="display.date-picker-month"
            accessibilityLabel="월"
            values={months}
            selected={month}
            label={(n) => format(t('display.picker.month'), { n })}
            onSelect={(value) => setPicked({ ...picked, month: value })}
          />
          <WheelPicker
            testID="display.date-picker-day"
            accessibilityLabel="일"
            values={days}
            selected={day}
            label={(n) => format(t('display.picker.day'), { n })}
            onSelect={(value) => setPicked({ ...picked, day: value })}
          />
        </View>
        <View style={styles.confirm}>
          <ChalkakButton
            testID="display.date-picker-confirm-button"
            label={t('common.confirm')}
            onPress={() => onConfirm(resolvePickedDate(range, year, month, day))}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  title: { ...typography.title3, color: colors.textPrimary },
  wheels: { flexDirection: 'row', gap: spacing.lg },
  confirm: { paddingTop: spacing.sm },
});
