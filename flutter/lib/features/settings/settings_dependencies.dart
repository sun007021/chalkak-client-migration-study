import '../../core/push/notification_permission.dart';
import '../feedback/domain/feedback_repository.dart';
import 'domain/notification_settings_repository.dart';
import 'presentation/settings_data_cleaner.dart';

/// 설정 탭과 피드백이 쓰는 의존성 묶음(`AppDependencies.settings`). 테스트는 Fake로 채워 넣는다.
class SettingsDependencies {
  const SettingsDependencies({
    required this.notificationSettings,
    required this.feedback,
    required this.permission,
    required this.dataCleaner,
    required this.appVersion,
  });

  final NotificationSettingsRepository notificationSettings;
  final FeedbackRepository feedback;

  /// 기기 알림 권한 창구. 푸시 쪽과 같은 객체를 쓴다.
  final NotificationPermission permission;

  /// 설정 ViewModel이 메인과 함께 생겼다 사라지므로 앱 수명의 cleaner 묶음에는 이 연결 고리를 넣는다.
  final SettingsDataCleaner dataCleaner;

  /// "버전정보" 행에 보일 앱 버전 문자열(접두 없이).
  final String appVersion;
}
