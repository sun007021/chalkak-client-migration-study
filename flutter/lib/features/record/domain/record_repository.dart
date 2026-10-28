import 'package:dio/dio.dart';

import '../../../core/time/kst_date.dart';
import 'record_models.dart';

/// 기록 탭이 읽는 API. 구현은 실패를 `ApiError`로 던진다.
abstract interface class RecordRepository {
  /// `GET /posts/calendar/months`. 서버 순서 그대로(최신순) 돌려준다. 없으면 빈 목록.
  Future<List<KstMonth>> months({CancelToken? cancelToken});

  /// `GET /posts/calendar?year=&month=`. 응답을 검증하고 날짜 오름차순으로 돌려준다.
  /// 검증(REQ-REC-018): 응답 year/month가 요청과 같다, 모든 topicDate가 그 달 안이다, 같은
  /// 날짜가 중복되지 않는다, thumbnailImageUrl이 비어 있지 않다, status가 PENDING/APPROVED다.
  /// 하나라도 어기면 `ApiError.invalidResponse`. 요청 값은 year 1~9999, month 1~12만 보낸다.
  Future<List<RecordPhoto>> calendar(
    KstMonth month, {
    CancelToken? cancelToken,
  });
}
