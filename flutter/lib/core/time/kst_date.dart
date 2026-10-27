/// KST(UTC+9 고정, 서머타임 없음) 달력 날짜. 기기 시간대와 무관하다.
class KstDate implements Comparable<KstDate> {
  const KstDate(this.year, this.month, this.day);

  final int year;
  final int month;
  final int day;

  /// 순간(Instant)을 KST 날짜로 바꾼다. 입력의 isUtc 여부와 무관하다.
  factory KstDate.fromInstant(DateTime instant) => throw UnimplementedError();

  /// 'yyyy-MM-dd'만 받는다. 잘못된 문자열·존재하지 않는 날짜는 FormatException.
  factory KstDate.parse(String source) => throw UnimplementedError();

  static KstDate? tryParse(String source) => throw UnimplementedError();

  /// D-12 FIRST_TOPIC_DATE.
  static KstDate get firstTopic => throw UnimplementedError();

  /// 월의 말일을 넘으면 말일로 보정한다(31일 → 30일 달, 2027-02-29 → 02-28).
  factory KstDate.clamped(int year, int month, int day) =>
      throw UnimplementedError();

  /// 로캘과 무관한 ASCII 'yyyy-MM-dd'.
  String toApiString() => throw UnimplementedError();

  KstDate addDays(int days) => throw UnimplementedError();

  /// 일요일 0 ... 토요일 6.
  int get weekdayIndex => throw UnimplementedError();

  KstMonth get yearMonth => throw UnimplementedError();

  /// 이 KST 날짜 00:00(KST)의 순간(UTC).
  DateTime get startInstant => throw UnimplementedError();

  @override
  int compareTo(KstDate other) => throw UnimplementedError();

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

  int get daysInMonth => throw UnimplementedError();

  KstDate get firstDate => throw UnimplementedError();

  KstDate get lastDate => throw UnimplementedError();

  KstMonth addMonths(int months) => throw UnimplementedError();

  /// 'yyyy-MM'.
  String toApiString() => throw UnimplementedError();

  @override
  int compareTo(KstMonth other) => throw UnimplementedError();
}
