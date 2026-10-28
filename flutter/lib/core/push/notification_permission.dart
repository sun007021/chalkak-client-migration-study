/// OS 알림 권한 상태.
enum OsPermissionStatus {
  /// 아직 묻지 않음. 요청하면 OS 대화상자가 뜬다.
  notDetermined,
  granted,
  denied,

  /// 런타임 권한이 없는 환경(Android 12 이하). 요청하지 않고 알림은 표시할 수 있다.
  notRequired,
}

/// OS 알림 권한 창구(iOS 알림·배지·소리, Android 13+ `POST_NOTIFICATIONS`).
/// 플랫폼 구현이 Android 초기 `denied`를 [OsPermissionStatus.notDetermined]로 바꿔 돌려준다.
abstract interface class NotificationPermission {
  Future<OsPermissionStatus> status();

  /// OS 권한 대화상자를 띄운다. 호출 자체가 실패하면 던진다.
  Future<OsPermissionStatus> request();
}
