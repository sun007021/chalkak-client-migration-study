import 'dart:typed_data';

import '../../../core/time/kst_date.dart';
import 'record_models.dart';

/// 저장할 달력 이미지의 입력(현재 보는 달, REQ-REC-037).
class RecordCalendarImageSpec {
  const RecordCalendarImageSpec({required this.month, required this.photos});

  final KstMonth month;
  final List<RecordPhoto> photos;
}

/// 달력을 PNG 바이트로 렌더한다. 구현은 가로세로가 0보다 큰 유효한 PNG(시그니처
/// `89 50 4E 47 0D 0A 1A 0A`)를 돌려준다. 정확한 픽셀 크기·디자인은 구현 소관이다.
abstract interface class CalendarImageRenderer {
  Future<Uint8List> render(RecordCalendarImageSpec spec);
}

/// 사진 보관함에 저장한다. OS 권한 거부는 [CalendarImagePermissionDenied], 그 밖의 실패는
/// 아무 예외로 던진다(REQ-REC-038~039). 파일명은 `chalkak-calendar-yyyy-MM.png`.
abstract interface class CalendarImageSaver {
  Future<void> save({required String fileName, required Uint8List pngBytes});
}

class CalendarImagePermissionDenied implements Exception {
  const CalendarImagePermissionDenied();
}
