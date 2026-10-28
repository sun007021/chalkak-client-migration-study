import '../../../core/time/kst_date.dart';

/// 일요일 시작 7열 달력 격자 계산(REQ-REC-009~010, TC-REC-010).
///
/// - [leadingBlanks]: 1일의 요일 인덱스(일 0 ... 토 6).
/// - [rowCount]: `ceil((leadingBlanks + daysInMonth) / 7)`.
/// - [cells]: 앞뒤 빈 칸은 null, 이전·다음 달 날짜로 채우지 않는다. 길이는 `rowCount * 7`.
/// 윤년·월말은 [KstMonth]의 계산을 쓴다.
class RecordCalendarGrid {
  const RecordCalendarGrid(this.month);

  final KstMonth month;

  int get leadingBlanks => throw UnimplementedError();
  int get rowCount => throw UnimplementedError();
  List<KstDate?> get cells => throw UnimplementedError();
}
