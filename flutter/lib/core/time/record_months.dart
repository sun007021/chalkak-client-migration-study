import 'kst_date.dart';

/// 기록 탭 월 선택지(D-19).
abstract final class RecordMonths {
  /// 서버 목록에 [current]를 합쳐 중복 없이 최신순으로 돌려준다.
  static List<KstMonth> options({
    required List<KstMonth> serverMonths,
    required KstMonth current,
  }) => throw UnimplementedError();
}
