import 'package:dio/dio.dart';

import '../../../core/time/kst_date.dart';
import 'display_models.dart';

/// 전시 API. 오류는 [ApiError]로 던진다.
abstract interface class DisplayRepository {
  /// `GET /topics?date=yyyy-MM-dd`. 404는 주제 없음. 응답 `topicDate`가 [date]와 다르면
  /// (REQ-DISP-002) `ApiError.invalidResponse`.
  Future<DisplayTopic> fetchTopic(KstDate date, {CancelToken? cancelToken});

  /// `GET /posts?topicDate&sort&page&pageSize=20[&randomSeed]`.
  /// - `sort`는 소문자, `pageSize`는 `AppConstants.pageSize`.
  /// - `randomSeed`는 `[A-Za-z0-9_-]{1,64}`일 때만 붙인다. 형식이 틀리면 요청 없이 ArgumentError.
  /// - 필수 필드가 없거나 `likeCount`가 음수인 항목이
  ///   있으면 `ApiError.invalidResponse`.
  /// - `thumbnailImageUrl`이 null이면 원본으로 대체한다.
  Future<PostPage> fetchPosts({
    required KstDate topicDate,
    required DisplaySort sort,
    required int page,
    String? randomSeed,
    CancelToken? cancelToken,
  });
}
