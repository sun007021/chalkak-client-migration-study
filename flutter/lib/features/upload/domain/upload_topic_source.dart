import 'package:dio/dio.dart';

import '../../../core/time/kst_date.dart';
import '../../home/domain/home_models.dart';

/// `GET /topics?date=` (REQ-UPL-009). 업로드 화면이 `topicId`와 제목을 얻는다.
abstract interface class UploadTopicSource {
  /// 404도 `ApiError`로 던진다(업로드 화면에서는 주제 없음이 곧 실패다).
  /// 응답 `topicDate`가 요청 [date]와 다르면 invalidResponse.
  Future<Topic> topicOn(KstDate date, {CancelToken? cancelToken});
}
