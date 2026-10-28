import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/api_request.dart';
import '../domain/notification_settings.dart';
import '../domain/notification_settings_repository.dart';

/// [NotificationSettingsRepository]의 `ApiClient` 구현. 규칙은 인터페이스 문서를 따른다.
class ApiNotificationSettingsRepository
    implements NotificationSettingsRepository {
  ApiNotificationSettingsRepository({required this._client});

  static const _path = '/notification-settings';

  final ApiClient _client;

  @override
  Future<NotificationSettings> fetch({CancelToken? cancelToken}) {
    return _client.request<NotificationSettings>(
      const ApiRequest.get(_path),
      decode: _decode,
      cancelToken: cancelToken,
    );
  }

  @override
  Future<void> update(
    PushSetting setting,
    bool enabled, {
    CancelToken? cancelToken,
  }) {
    // 본문은 바꾼 항목 하나뿐이다(나머지 생략). 204 본문은 읽지 않는다.
    return _client.requestNoContent(
      ApiRequest(
        HttpMethod.patch,
        _path,
        body: {setting.wireKey: enabled},
      ),
      cancelToken: cancelToken,
    );
  }

  /// 세 필드가 모두 Boolean이어야 한다. 아니면 `BodyDecoder`가 invalidResponse로 바꾼다.
  static NotificationSettings _decode(Object? json) {
    if (json is! Map) {
      throw ApiError.invalidResponse();
    }
    bool read(PushSetting setting) {
      final value = json[setting.wireKey];
      if (value is! bool) throw ApiError.invalidResponse();
      return value;
    }

    return NotificationSettings(
      topic: read(PushSetting.topic),
      moderation: read(PushSetting.moderation),
      aiReview: read(PushSetting.aiReview),
    );
  }
}
