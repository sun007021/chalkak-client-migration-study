// 구현 전 껍데기: 본문이 비어 있어 필드가 아직 쓰이지 않는다. 구현하면서 이 줄을 지운다.
// ignore_for_file: unused_field

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/notification_models.dart';
import '../domain/notification_repository.dart';

/// [NotificationRepository]의 ApiClient 구현.
/// - 목록: `GET /notifications` 쿼리 `page`, `pageSize`. 필수 필드(id, type, title, body, createdAt, 페이지 메타)
///   누락·깨진 JSON은 `invalidResponse`. `sourceType`·`sourceId`·`thumbnailImageUrl`·`readAt`은 null/생략 허용.
///   시각은 소수 초 유무와 관계없이 UTC Instant로 읽는다(`parseInstant`).
/// - 상세: `GET /notifications/{id}`, 읽음: `PATCH /notifications/{id}/read`(본문 없음).
class ApiNotificationRepository implements NotificationRepository {
  ApiNotificationRepository({required this._client});

  final ApiClient _client;

  @override
  Future<NotificationPage> fetchPage({
    required int page,
    int pageSize = 20,
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  @override
  Future<NotificationDetail> fetchDetail(
    String notificationId, {
    CancelToken? cancelToken,
  }) => throw UnimplementedError();

  @override
  Future<void> markRead(String notificationId, {CancelToken? cancelToken}) =>
      throw UnimplementedError();
}
