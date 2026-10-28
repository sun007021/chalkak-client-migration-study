/// docs/testing/testids.md 기록 절의 식별자.
abstract final class RecordTestIds {
  static const root = 'record.root';
  static const monthLabel = 'record.month-label';
  static const prevMonthButton = 'record.prev-month-button';
  static const nextMonthButton = 'record.next-month-button';
  static const monthPickerButton = 'record.month-picker-button';
  static const monthPickerSheet = 'record.month-picker-sheet';
  static String monthPickerItem(String yyyyMm) =>
      'record.month-picker-item-$yyyyMm';
  static const weekdayHeader = 'record.weekday-header';
  static const calendarGrid = 'record.calendar-grid';
  static String day(String yyyyMmDd) => 'record.day-$yyyyMmDd';
  static const selectedPhoto = 'record.selected-photo';
  static const pendingBadge = 'record.pending-badge';
  static const pendingTooltip = 'record.pending-tooltip';
  static const viewFeedButton = 'record.view-feed-button';
  static const viewDisplayButton = 'record.view-display-button';
  static const saveImageButton = 'record.save-image-button';
  static const loginRequiredState = 'record.login-required-state';
  static const loginButton = 'record.login-button';
  static const invalidMonthMessage = 'record.invalid-month-message';
  static const loading = 'record.loading';
  static const emptyState = 'record.empty-state';
  static const errorState = 'record.error-state';
  static const retryButton = 'record.retry-button';
}
