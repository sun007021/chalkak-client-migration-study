/// 기기(OS) 알림 권한 상태.
enum NotificationPermission {
  /// 허용.
  granted,

  /// 거부(iOS 거부, Android 알림 비허용).
  denied,

  /// 아직 결정되지 않음(iOS 미결정).
  notDetermined,
}

/// OS 알림 권한 경계. 실제 구현은 플러그인 뒤에 두고 테스트는 Fake를 쓴다.
/// Web은 이 경계를 쓰지 않는다(REQ-SET-019).
abstract interface class NotificationPermissionGateway {
  Future<NotificationPermission> status();

  /// 시스템 권한 요청을 띄우고 허용됐으면 true.
  Future<bool> request();

  /// 시스템 알림 설정 화면을 연다(iOS 앱 설정, Android 앱 알림 설정).
  Future<void> openSystemSettings();
}
