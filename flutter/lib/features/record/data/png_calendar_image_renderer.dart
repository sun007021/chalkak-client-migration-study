import 'dart:typed_data';

import '../domain/record_calendar_image.dart';

/// `dart:ui`로 달력을 PNG로 그리는 [CalendarImageRenderer]. 월 제목, 요일 머리글, 날짜 숫자,
/// 사진이 있는 날 표시를 담는다(썸네일 포함 여부는 구현 재량: record.md 확인 필요).
class PngCalendarImageRenderer implements CalendarImageRenderer {
  const PngCalendarImageRenderer();

  @override
  Future<Uint8List> render(RecordCalendarImageSpec spec) =>
      throw UnimplementedError();
}
