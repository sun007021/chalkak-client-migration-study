import '../constants/app_constants.dart';

const _kstOffset = Duration(hours: 9);

String _pad(int value, int width) => value.toString().padLeft(width, '0');

/// KST(UTC+9 고정, 서머타임 없음) 달력 날짜. 기기 시간대와 무관하다.
class KstDate implements Comparable<KstDate> {
  const KstDate(this.year, this.month, this.day);

  final int year;
  final int month;
  final int day;

  /// 순간(Instant)을 KST 날짜로 바꾼다. 입력의 isUtc 여부와 무관하다.
  factory KstDate.fromInstant(DateTime instant) {
    final kst = instant.toUtc().add(_kstOffset);
    return KstDate(kst.year, kst.month, kst.day);
  }

  /// 'yyyy-MM-dd'만 받는다. 잘못된 문자열·존재하지 않는 날짜는 FormatException.
  factory KstDate.parse(String source) =>
      tryParse(source) ??
      (throw FormatException('yyyy-MM-dd 형식이 아닙니다', source));

  static KstDate? tryParse(String source) {
    final m = _pattern.firstMatch(source);
    if (m == null) return null;
    final y = int.parse(m.group(1)!);
    final mo = int.parse(m.group(2)!);
    final d = int.parse(m.group(3)!);
    if (mo < 1 || mo > 12 || d < 1 || d > KstMonth(y, mo).daysInMonth) {
      return null;
    }
    return KstDate(y, mo, d);
  }

  static final _pattern = RegExp(r'^([0-9]{4})-([0-9]{2})-([0-9]{2})$');

  /// D-12 FIRST_TOPIC_DATE.
  static KstDate get firstTopic => KstDate.parse(AppConstants.firstTopicDate);

  /// 월의 말일을 넘으면 말일로 보정한다(31일 → 30일 달, 2027-02-29 → 02-28).
  factory KstDate.clamped(int year, int month, int day) {
    final last = KstMonth(year, month).daysInMonth;
    return KstDate(year, month, day > last ? last : day);
  }

  /// 로캘과 무관한 ASCII 'yyyy-MM-dd'.
  String toApiString() => '${_pad(year, 4)}-${_pad(month, 2)}-${_pad(day, 2)}';

  KstDate addDays(int days) {
    final moved = DateTime.utc(year, month, day + days);
    return KstDate(moved.year, moved.month, moved.day);
  }

  /// 일요일 0 ... 토요일 6.
  int get weekdayIndex => DateTime.utc(year, month, day).weekday % 7;

  KstMonth get yearMonth => KstMonth(year, month);

  /// 이 KST 날짜 00:00(KST)의 순간(UTC).
  DateTime get startInstant =>
      DateTime.utc(year, month, day).subtract(_kstOffset);

  @override
  int compareTo(KstDate other) {
    if (year != other.year) return year.compareTo(other.year);
    if (month != other.month) return month.compareTo(other.month);
    return day.compareTo(other.day);
  }

  @override
  bool operator ==(Object other) =>
      other is KstDate &&
      other.year == year &&
      other.month == month &&
      other.day == day;

  @override
  int get hashCode => Object.hash(year, month, day);

  @override
  String toString() => toApiString();

  bool operator <(KstDate other) => compareTo(other) < 0;
  bool operator <=(KstDate other) => compareTo(other) <= 0;
  bool operator >(KstDate other) => compareTo(other) > 0;
  bool operator >=(KstDate other) => compareTo(other) >= 0;
}

/// KST 연월.
class KstMonth implements Comparable<KstMonth> {
  const KstMonth(this.year, this.month);

  final int year;
  final int month;

  int get daysInMonth => DateTime.utc(year, month + 1, 0).day;

  KstDate get firstDate => KstDate(year, month, 1);

  KstDate get lastDate => KstDate(year, month, daysInMonth);

  KstMonth addMonths(int months) {
    final total = year * 12 + (month - 1) + months;
    return KstMonth(total ~/ 12, total % 12 + 1);
  }

  /// 'yyyy-MM'.
  String toApiString() => '${_pad(year, 4)}-${_pad(month, 2)}';

  @override
  int compareTo(KstMonth other) => year != other.year
      ? year.compareTo(other.year)
      : month.compareTo(other.month);

  @override
  bool operator ==(Object other) =>
      other is KstMonth && other.year == year && other.month == month;

  @override
  int get hashCode => Object.hash(year, month);

  @override
  String toString() => toApiString();
}
