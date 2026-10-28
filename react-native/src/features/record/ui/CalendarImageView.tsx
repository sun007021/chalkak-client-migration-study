import { Image, StyleSheet, Text, View } from 'react-native';

import { t } from '../../../shared/copy';
import { colors } from '../../../shared/ui/theme';
import { buildCalendarGrid } from '../calendarGrid';
import type { CalendarImageInput } from '../CalendarImage';
import { RECORD_COPY } from '../recordCopy';

/** 저장용 달력 이미지의 레이아웃(dp). 기기 화면 크기와 무관하게 같은 모양으로 그린다. */
export const CALENDAR_IMAGE = { width: 360, cell: 48, padding: 12 } as const;

type Props = {
  input: CalendarImageInput;
  /** 썸네일 하나의 로딩이 끝났다(성공·실패 모두). 호스트가 모두 끝나길 기다렸다 캡처한다. */
  onPhotoSettled?: () => void;
};

/**
 * 달력 이미지로 저장할 뷰: 연월 제목, 요일 머리글, 날짜 격자(사진 있는 날은 썸네일).
 * 화면에 보이는 달력(RecordScreen)과 별개로 고정 크기·상호작용 없음이다.
 */
export function CalendarImageView({ input, onPhotoSettled }: Props) {
  const grid = buildCalendarGrid(input.month);
  const photoByDate = new Map(input.photos.map((photo) => [photo.date.toString(), photo]));
  const rows = Array.from({ length: grid.rows }, (_, row) =>
    grid.cells.slice(row * 7, row * 7 + 7),
  );
  return (
    <View style={styles.root} collapsable={false}>
      <Text style={styles.title}>{RECORD_COPY.monthLabel(input.month)}</Text>
      <View style={styles.row}>
        {[...t('record.weekday')].map((label, index) => (
          <Text key={index} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map((cells, row) => (
        <View key={row} style={styles.row}>
          {cells.map((date, column) => {
            if (date === null) return <View key={column} style={styles.cell} />;
            const photo = photoByDate.get(date.toString());
            const isToday = date.equals(input.today);
            return (
              <View key={column} style={[styles.cell, isToday && styles.today]}>
                {photo ? (
                  <Image
                    testID={`calendar-image.photo-${date.toString()}`}
                    source={{ uri: photo.thumbnailUrl }}
                    style={styles.photo}
                    onLoad={onPhotoSettled}
                    onError={onPhotoSettled}
                  />
                ) : null}
                <Text style={[styles.day, photo && styles.dayOnPhoto]}>{date.day}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const { width, cell, padding } = CALENDAR_IMAGE;

const styles = StyleSheet.create({
  root: { width, padding, backgroundColor: colors.background },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  row: { flexDirection: 'row' },
  weekday: {
    width: cell,
    paddingVertical: 6,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
  },
  cell: {
    width: cell,
    height: cell,
    padding: 2,
    overflow: 'hidden',
    borderRadius: 8,
  },
  today: { borderWidth: 2, borderColor: colors.accent },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8 },
  day: { fontSize: 11, color: colors.textSecondary },
  dayOnPhoto: {
    color: '#FFFFFF',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 2,
  },
});
