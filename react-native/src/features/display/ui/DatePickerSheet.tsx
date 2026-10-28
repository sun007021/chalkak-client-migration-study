import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { KstDate } from '../../../core/time/KstDate';
import { format, t } from '../../../shared/copy';
import { colors, spacing } from '../../../shared/ui/theme';
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

/** "날짜 선택" 시트: 연·월·일 세 열에서 하한~상한 안의 값만 고른다. 마운트될 때마다 현재 날짜에서 시작한다. */
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
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View testID="display.date-picker-sheet" style={styles.sheet}>
          <Text style={styles.title}>{t('display.picker.title')}</Text>
          <View style={styles.columns}>
            <Column
              testID="display.date-picker-year"
              values={years}
              selected={year}
              label={(n) => format(t('display.picker.year'), { n })}
              onSelect={(value) => setPicked({ ...picked, year: value })}
            />
            <Column
              testID="display.date-picker-month"
              values={months}
              selected={month}
              label={(n) => format(t('display.picker.month'), { n })}
              onSelect={(value) => setPicked({ ...picked, month: value })}
            />
            <Column
              testID="display.date-picker-day"
              values={days}
              selected={day}
              label={(n) => format(t('display.picker.day'), { n })}
              onSelect={(value) => setPicked({ ...picked, day: value })}
            />
          </View>
          <Pressable
            testID="display.date-picker-confirm-button"
            accessibilityRole="button"
            onPress={() => onConfirm(resolvePickedDate(range, year, month, day))}
            style={styles.confirm}
          >
            <Text style={styles.confirmText}>{t('common.confirm')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Column({
  testID,
  values,
  selected,
  label,
  onSelect,
}: {
  testID: string;
  values: readonly number[];
  selected: number;
  label: (n: number) => string;
  onSelect: (value: number) => void;
}) {
  return (
    <ScrollView testID={testID} style={styles.column} showsVerticalScrollIndicator={false}>
      {values.map((value) => (
        <Pressable
          key={value}
          testID={`${testID}-${value}`}
          accessibilityRole="button"
          accessibilityState={{ selected: value === selected }}
          onPress={() => onSelect(value)}
          style={[styles.option, value === selected && styles.optionSelected]}
        >
          <Text style={[styles.optionText, value === selected && styles.optionTextSelected]}>
            {label(value)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  columns: { flexDirection: 'row', height: 200, gap: spacing.sm },
  column: { flex: 1 },
  option: { paddingVertical: spacing.sm, alignItems: 'center', borderRadius: 8 },
  optionSelected: { backgroundColor: colors.surface },
  optionText: { fontSize: 16, color: colors.textSecondary },
  optionTextSelected: { color: colors.textPrimary, fontWeight: '700' },
  confirm: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  confirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
