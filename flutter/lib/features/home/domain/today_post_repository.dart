import 'package:dio/dio.dart';

import 'home_models.dart';

/// `GET /posts/today`. 홈 히어로와 업로드 진입 게이트가 함께 쓴다(D-06, D-14).
/// 실패(404, 403, 401, 5xx, 응답 검증 실패)는 `ApiError`로 던진다.
abstract interface class TodayPostRepository {
  Future<TodayPost> today({CancelToken? cancelToken});
}
