import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/notification_settings.dart';
import '../domain/notification_settings_repository.dart';

/// [NotificationSettingsRepository]의 `ApiClient` 구현. 규칙은 인터페이스 문서를 따른다.
class ApiNotificationSettingsRepository
    implements NotificationSettingsRepository {
  ApiNotificationSettingsRepository({required this._client});

  // ignore: unused_field
  final ApiClient _client;

  @override
  Future<NotificationSettings> fetch({CancelToken? cancelToken}) {
    throw UnimplementedError();
  }

  @override
  Future<void> update(
    PushSetting setting,
    bool enabled, {
    CancelToken? cancelToken,
  }) {
    throw UnimplementedError();
  }
}
