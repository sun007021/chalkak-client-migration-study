import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/api_format.dart';
import '../../../core/network/api_request.dart';
import '../../../core/time/instant_parser.dart';
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

  static String _path(String id) =>
      '/notifications/${Uri.encodeComponent(ApiFormat.uuid(id))}';

  @override
  Future<NotificationPage> fetchPage({
    required int page,
    int pageSize = 20,
    CancelToken? cancelToken,
  }) {
    return _client.request<NotificationPage>(
      ApiRequest.get(
        '/notifications',
        query: {
          'page': ApiFormat.integer(page),
          'pageSize': ApiFormat.integer(pageSize),
        },
      ),
      decode: _parsePage,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<NotificationDetail> fetchDetail(
    String notificationId, {
    CancelToken? cancelToken,
  }) {
    return _client.request<NotificationDetail>(
      ApiRequest.get(_path(notificationId)),
      decode: _parseDetail,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<void> markRead(String notificationId, {CancelToken? cancelToken}) {
    return _client.requestNoContent(
      ApiRequest(HttpMethod.patch, '${_path(notificationId)}/read'),
      cancelToken: cancelToken,
    );
  }

  static NotificationPage _parsePage(Object? json) {
    final map = json! as Map;
    return NotificationPage(
      currentPage: map['currentPage']! as int,
      pageSize: map['pageSize']! as int,
      hasNext: map['hasNext']! as bool,
      items: [
        for (final n in map['notifications']! as List) _parseItem(n! as Map),
      ],
    );
  }

  static NotificationItem _parseItem(Map map) {
    final rawType = map['type']! as String;
    return NotificationItem(
      id: map['id']! as String,
      type: NotificationType.fromWire(rawType),
      rawType: rawType,
      sourceType: map['sourceType'] as String?,
      sourceId: map['sourceId'] as String?,
      title: map['title']! as String,
      body: map['body']! as String,
      thumbnailImageUrl: map['thumbnailImageUrl'] as String?,
      readAt: _optionalInstant(map['readAt']),
      createdAt: _instant(map['createdAt']),
    );
  }

  static NotificationDetail _parseDetail(Object? json) {
    final map = json! as Map;
    final rawType = map['type']! as String;
    return NotificationDetail(
      id: map['id']! as String,
      type: NotificationType.fromWire(rawType),
      rawType: rawType,
      title: map['title']! as String,
      body: map['body']! as String,
      originalImageUrl: map['originalImageUrl'] as String?,
      rejectionReason: map['rejectionReason'] as String?,
      readAt: _optionalInstant(map['readAt']),
      createdAt: _instant(map['createdAt']),
    );
  }

  static DateTime _instant(Object? raw) {
    final parsed = parseInstant(raw! as String);
    if (parsed == null) {
      throw ApiError.invalidResponse(
        cause: const FormatException('시각 형식이 올바르지 않다'),
      );
    }
    return parsed;
  }

  static DateTime? _optionalInstant(Object? raw) =>
      raw == null ? null : _instant(raw);
}
