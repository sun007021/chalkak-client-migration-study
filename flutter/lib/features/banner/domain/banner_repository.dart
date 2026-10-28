import 'package:dio/dio.dart';

import 'banner_models.dart';

/// 배너 조회. 구현은 오류를 `ApiError`로 던진다.
abstract interface class BannerRepository {
  /// `GET /banners?page=&pageSize=10`. Authorization 헤더를 붙이지 않는다(REQ-BANR-001).
  /// `webViewUrl`이 https가 아닌 배너가 하나라도 있거나 JSON이 깨졌으면 invalidResponse.
  Future<BannerPage> fetchPage(int page, {CancelToken? cancelToken});
}
