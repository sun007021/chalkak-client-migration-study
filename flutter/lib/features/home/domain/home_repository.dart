import 'package:dio/dio.dart';

import '../../../core/time/kst_date.dart';
import 'home_models.dart';

/// 홈이 읽는 API. 구현은 실패를 `ApiError`로 던진다.
abstract interface class HomeRepository {
  /// `GET /topics?date=`. 404이면 null. 응답 `topicDate`가 요청 날짜와 다르면 invalidResponse.
  Future<Topic?> topicOn(KstDate date, {CancelToken? cancelToken});

  /// `GET /posts?topicDate=&sort=popular&page=1&pageSize=20`. 서버 순서 그대로 전부 돌려준다
  /// (앞 5장 자르기는 호출자 몫). 404이면 빈 목록. Authorization은 세션이 있으면 붙는다.
  Future<List<PostSummary>> popularPosts(
    KstDate topicDate, {
    CancelToken? cancelToken,
  });

  /// `GET /posts/calendar?year=&month=`.
  Future<List<CalendarEntry>> calendar(
    KstMonth month, {
    CancelToken? cancelToken,
  });

  /// `GET /notifications/unread-status`의 `hasUnread`.
  Future<bool> hasUnreadNotifications({CancelToken? cancelToken});
}
