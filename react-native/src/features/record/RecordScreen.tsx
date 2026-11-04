import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useViewModelState } from '../../core/state/useViewModelState';
import { formatMonthDay } from '../../core/time/dateFormat';
import type { KstDate } from '../../core/time/KstDate';
import type { YearMonth } from '../../core/time/YearMonth';
import type { RecordPhoto } from '../../data/record/RecordModels';
import { useGlassBarInset } from '../../shared/glass/glass';
import { t } from '../../shared/copy';
import { colors, radius, spacing, typography } from '../../shared/design/tokens';
import { buildCalendarGrid, formatRecordMonthLabel } from './calendarGrid';
import { RECORD_COPY } from './recordCopy';
import type { RecordState } from './RecordState';
import type { RecordViewModel } from './RecordViewModel';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { ChalkakButton, ChalkakOutlinedButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/icons/Icon';
import { RemoteImage } from '../../shared/ui/RemoteImage';
import { Skeleton } from '../../shared/ui/Skeleton';
import { Text } from '../../shared/ui/Text';

const CELL_GAP = 6; // screens-c.md §2.3 칸 간격

/**
 * 기록 탭 화면. 상태를 그리기만 하고 분기는 ViewModel이 한다. testID는 docs/testing/testids.md의 record 표를 따른다.
 * 마운트 = onShown, 언마운트 = onHidden이다(탭을 포커스일 때만 마운트하므로 복귀가 곧 "다시 보임"). ViewModel은 소유자가 만든다.
 */
export function RecordScreen({ viewModel }: { viewModel: RecordViewModel }) {
  const state = useViewModelState(viewModel);
  const insets = useSafeAreaInsets();
  const barInset = useGlassBarInset();
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    void viewModel.onShown();
    return () => viewModel.onHidden();
  }, [viewModel]);

  return (
    <View testID="record.root" style={[styles.root, { paddingTop: insets.top }]}>
      <MonthHeader state={state} viewModel={viewModel} onPickerPress={() => setPickerOpen(true)} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + barInset }]}
      >
        {state.status === 'loading' ? <CalendarSkeleton /> : null}
        {state.status === 'error' ? <ErrorState state={state} viewModel={viewModel} /> : null}
        {state.status === 'content' ? <ContentState state={state} viewModel={viewModel} /> : null}
      </ScrollView>
      {pickerOpen ? (
        <MonthPickerSheet
          months={state.availableMonths}
          selected={state.month}
          onSelect={(month) => {
            setPickerOpen(false);
            void viewModel.selectMonth(month);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

function MonthHeader({
  state,
  viewModel,
  onPickerPress,
}: {
  state: RecordState;
  viewModel: RecordViewModel;
  onPickerPress: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        testID="record.prev-month-button"
        accessibilityRole="button"
        accessibilityLabel={RECORD_COPY.previousMonth}
        disabled={!state.canGoPrevious}
        onPress={() => void viewModel.goPrevious()}
        style={[styles.arrowButton, !state.canGoPrevious && styles.disabled]}
      >
        <Icon name="ic_display_arrow_left" size={18} color={colors.iconPrimary} />
      </Pressable>
      <Pressable
        testID="record.month-picker-button"
        accessibilityRole="button"
        accessibilityLabel={RECORD_COPY.monthPickerButton}
        onPress={onPickerPress}
        hitSlop={8}
      >
        <Text testID="record.month-label" style={styles.monthLabel}>
          {formatRecordMonthLabel(state.month)}
        </Text>
      </Pressable>
      <Pressable
        testID="record.next-month-button"
        accessibilityRole="button"
        accessibilityLabel={RECORD_COPY.nextMonth}
        disabled={!state.canGoNext}
        onPress={() => void viewModel.goNext()}
        style={[styles.arrowButton, !state.canGoNext && styles.disabled]}
      >
        <Icon name="ic_display_arrow_right" size={18} color={colors.iconPrimary} />
      </Pressable>
    </View>
  );
}

/** 로딩: 달력 틀(요일 머리글 + 빈 칸)을 쉬머로 먼저 그린다(screens-c.md §2.9, §1.8). */
function CalendarSkeleton() {
  return (
    <View testID="record.loading" style={styles.grid}>
      {Array.from({ length: 5 }, (_, row) => (
        <View key={row} style={styles.row}>
          {Array.from({ length: 7 }, (_, column) => (
            <Skeleton key={column} style={styles.cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

function ErrorState({ state, viewModel }: { state: RecordState; viewModel: RecordViewModel }) {
  return (
    <View testID="record.error-state" style={styles.center}>
      {state.error === 'login-required' ? (
        <View testID="record.login-required-state" style={styles.errorBox}>
          <Text style={styles.message}>{t('record.err.401')}</Text>
          <TextAction
            testID="record.login-button"
            label={t('record.guest.login')}
            onPress={() => viewModel.onLoginPress()}
          />
        </View>
      ) : null}
      {state.error === 'invalid-month' ? (
        <Text testID="record.invalid-month-message" style={styles.message}>
          {t('record.err.400')}
        </Text>
      ) : null}
      {state.error === 'generic' ? (
        <View style={styles.errorBox}>
          <Text testID="record.error-message" style={styles.message}>
            {t('record.err.other')}
          </Text>
          <TextAction
            testID="record.retry-button"
            label={t('common.retry')}
            onPress={() => void viewModel.retry()}
          />
        </View>
      ) : null}
    </View>
  );
}

function ContentState({ state, viewModel }: { state: RecordState; viewModel: RecordViewModel }) {
  return (
    <>
      <CalendarGrid state={state} onDayPress={(date) => viewModel.selectDate(date)} />
      {state.photos.length === 0 ? (
        <Text testID="record.empty-state" style={styles.empty}>
          {RECORD_COPY.empty}
        </Text>
      ) : null}
      {state.selectedPhoto ? (
        // 날짜를 바꾸면 안내 풍선 상태를 새로 시작한다.
        <SelectedPhoto
          key={state.selectedPhoto.postId}
          photo={state.selectedPhoto}
          onViewFeed={() => viewModel.onViewFeed()}
          onViewDisplay={() => viewModel.onViewDisplay()}
        />
      ) : null}
      <ChalkakButton
        testID="record.save-image-button"
        label={t('record.save')}
        disabled={state.saving}
        onPress={() => void viewModel.saveImage()}
      />
    </>
  );
}

function CalendarGrid({
  state,
  onDayPress,
}: {
  state: RecordState;
  onDayPress: (date: KstDate) => void;
}) {
  const grid = buildCalendarGrid(state.month);
  const photoByDate = new Map(state.photos.map((photo) => [photo.date.toString(), photo]));
  const rows = Array.from({ length: grid.rows }, (_, row) =>
    grid.cells.slice(row * 7, row * 7 + 7),
  );
  return (
    <View testID="record.calendar-grid" style={styles.grid}>
      <View testID="record.weekday-header" style={styles.weekdayRow}>
        {[...t('record.weekday')].map((label, index) => (
          <Text key={index} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      {rows.map((cells, row) => (
        <View key={row} style={styles.row}>
          {cells.map((date, column) =>
            date === null ? (
              <View key={column} style={[styles.cell, styles.cellEmpty]} />
            ) : (
              <DayCell
                key={column}
                date={date}
                photo={photoByDate.get(date.toString())}
                isToday={date.equals(state.today)}
                selected={state.selectedDate?.equals(date) ?? false}
                onPress={() => onDayPress(date)}
              />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function DayCell({
  date,
  photo,
  isToday,
  selected,
  onPress,
}: {
  date: KstDate;
  photo: RecordPhoto | undefined;
  isToday: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const id = date.toString();
  return (
    <Pressable
      testID={`record.day-${id}`}
      accessibilityRole="button"
      accessibilityLabel={formatMonthDay(date)}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.cell, selected && styles.cellSelected]}
    >
      {photo ? (
        <RemoteImage
          testID={`record.day-photo-${id}`}
          uri={photo.thumbnailUrl}
          style={styles.photo}
        />
      ) : null}
      {photo?.status === 'PENDING' ? (
        <View testID={`record.day-pending-${id}`} style={styles.pendingDot} />
      ) : null}
      <Text style={[styles.day, photo && styles.dayOnPhoto]}>{date.day}</Text>
      {isToday ? <View testID="record.today-marker" style={styles.todayMarker} /> : null}
    </Pressable>
  );
}

function SelectedPhoto({
  photo,
  onViewFeed,
  onViewDisplay,
}: {
  photo: RecordPhoto;
  onViewFeed: () => void;
  onViewDisplay: () => void;
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  return (
    <View testID="record.selected-photo" style={styles.panel}>
      <Text style={styles.panelDate}>{formatMonthDay(photo.date)}</Text>
      <RemoteImage uri={photo.thumbnailUrl} style={styles.panelPhoto} />
      {photo.status === 'PENDING' ? (
        <View style={styles.pending}>
          <Pressable
            testID="record.pending-badge"
            accessibilityRole="button"
            accessibilityLabel={
              tooltipOpen ? t('record.pending.hint-close') : t('record.pending.hint-open')
            }
            onPress={() => setTooltipOpen((open) => !open)}
            style={styles.badge}
          >
            <Text style={styles.badgeText}>{t('record.pending.badge')}</Text>
          </Pressable>
          {tooltipOpen ? (
            <Text testID="record.pending-tooltip" style={styles.tooltip}>
              {t('record.pending.tooltip')}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.actions}>
          <ChalkakOutlinedButton
            testID="record.view-feed-button"
            label={t('record.action.feed')}
            onPress={onViewFeed}
            style={styles.flex}
          />
          <ChalkakButton
            testID="record.view-display-button"
            label={t('record.action.display')}
            onPress={onViewDisplay}
            style={styles.flex}
          />
        </View>
      )}
    </View>
  );
}

function MonthPickerSheet({
  months,
  selected,
  onSelect,
  onClose,
}: {
  months: readonly YearMonth[];
  selected: YearMonth;
  onSelect: (month: YearMonth) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet testID="record.month-picker-sheet" onRequestClose={onClose}>
      <Text style={styles.sheetTitle}>{RECORD_COPY.monthPickerTitle}</Text>
      <ScrollView style={styles.sheetList}>
        {months.map((month) => {
          const isSelected = month.equals(selected);
          return (
            <Pressable
              key={month.toString()}
              testID={`record.month-picker-item-${month.toString()}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(month)}
              style={[styles.option, isSelected && styles.optionSelected]}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                {formatRecordMonthLabel(month)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        testID="record.month-picker-close-button"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.close}
      >
        <Text style={styles.closeText}>{RECORD_COPY.monthPickerClose}</Text>
      </Pressable>
    </BottomSheet>
  );
}

/** 텍스트 버튼(에러 영역): body, actionPrimary, 최소 높이 44(screens-c.md §2.9). */
function TextAction({
  testID,
  label,
  onPress,
}: {
  testID: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.textAction}
    >
      <Text style={styles.textActionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  arrowButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  monthLabel: { ...typography.title2, color: colors.textPrimary },
  content: {
    paddingHorizontal: spacing.screenHorizontal - 5,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl },
  errorBox: { alignItems: 'center', gap: spacing.xs },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.screenHorizontal - 5,
  },
  empty: { ...typography.subheadline, color: colors.textMuted, textAlign: 'center' },
  grid: { gap: CELL_GAP },
  row: { flexDirection: 'row', gap: CELL_GAP },
  weekdayRow: { flexDirection: 'row', gap: CELL_GAP, marginBottom: spacing.sm },
  weekday: {
    ...typography.caption,
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.small,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.calendarCell,
  },
  cellEmpty: { backgroundColor: 'transparent' },
  cellSelected: { borderWidth: 2, borderColor: colors.calendarSelection },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  pendingDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  day: { ...typography.caption, color: colors.textSecondary },
  dayOnPhoto: {
    color: colors.textOnImage,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 2,
  },
  todayMarker: {
    position: 'absolute',
    bottom: 3,
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  panel: { gap: spacing.md, alignItems: 'center' },
  panelDate: { ...typography.headline, color: colors.textPrimary },
  panelPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.photoCard,
    overflow: 'hidden',
    backgroundColor: colors.calendarCell,
  },
  pending: { alignItems: 'center', gap: spacing.sm },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
  },
  badgeText: { ...typography.footnote, color: colors.accent },
  tooltip: {
    ...typography.footnote,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.md,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  flex: { flex: 1 },
  textAction: { minHeight: 44, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  textActionLabel: { ...typography.body, color: colors.actionPrimary },
  sheetTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  sheetList: { flexGrow: 0 },
  option: { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.button },
  optionSelected: { backgroundColor: colors.calendarCell },
  optionText: { ...typography.body, color: colors.textSecondary },
  optionTextSelected: { color: colors.textPrimary, fontWeight: '700' },
  close: { alignItems: 'center', paddingVertical: spacing.md },
  closeText: { ...typography.body, color: colors.textSecondary },
});
