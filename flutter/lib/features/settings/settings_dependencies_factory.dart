import '../../core/network/api_client.dart';
import '../../core/push/notification_permission.dart';
import '../feedback/data/api_feedback_repository.dart';
import 'data/api_notification_settings_repository.dart';
import 'presentation/settings_data_cleaner.dart';
import 'settings_dependencies.dart';

/// 실제 구현으로 [SettingsDependencies]를 조립한다.
SettingsDependencies buildSettingsDependencies({
  required ApiClient client,
  required NotificationPermission permission,
  required String appVersion,
}) {
  return SettingsDependencies(
    notificationSettings: ApiNotificationSettingsRepository(client: client),
    feedback: ApiFeedbackRepository(client: client),
    permission: permission,
    dataCleaner: SettingsDataCleaner(),
    appVersion: appVersion,
  );
}
