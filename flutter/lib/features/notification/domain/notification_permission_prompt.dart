import '../../../core/copy/ko.g.dart';
import '../../../core/push/notification_permission.dart';
import '../../../core/ui/toast/toast_controller.dart';

/// "OS 권한을 이미 요청했다" 기기 단위 표시(앱 설치당 한 번, 계정과 무관: TC-PUSH-011).
abstract interface class PermissionPromptFlag {
  Future<bool> isRequested();
  Future<void> markRequested();
}

/// 인증 사용자가 메인에 처음 들어온 직후의 알림 권한 요청(REQ-PUSH-001~006).
/// 임시 규칙(spec 확인 필요 1, Android 방식): OS 대화상자만 쓰고 앱 안내 대화상자와
/// `PATCH /notification-settings`는 없다.
/// [onMainEntered]:
/// - 게스트면 요청도 표시 저장도 없다(TC-PUSH-004).
/// - 이미 요청함 표시가 있으면 아무것도 하지 않는다.
/// - 표시를 먼저 저장한 뒤 상태를 본다: 미결정이면 [NotificationPermission.request]를 1회 호출,
///   허용·거부·런타임 권한 없음(Android 12 이하)이면 요청 없이 표시만 저장한다(REQ-PUSH-004).
/// - 요청 호출이 던지면 `Copy.notiPermError` 토스트를 보이고 표시는 유지한다(REQ-PUSH-006).
class NotificationPermissionPrompt {
  NotificationPermissionPrompt({
    required this._permission,
    required this._flag,
    required this._toast,
  });

  final NotificationPermission _permission;
  final PermissionPromptFlag _flag;
  final ToastSink _toast;

  /// 같은 프로세스에서 겹쳐 들어온 호출(재진입)은 한 번만 처리한다.
  Future<void>? _running;

  Future<void> onMainEntered({required bool isGuest}) {
    if (isGuest) return Future<void>.value();
    return _running ??= _run().whenComplete(() => _running = null);
  }

  Future<void> _run() async {
    try {
      if (await _flag.isRequested()) return;
      // 요청 호출이 실패해도 표시는 남긴다(REQ-PUSH-001, 006): 같은 설치에서 반복해 묻지 않는다.
      await _flag.markRequested();
      final status = await _permission.status();
      if (status != OsPermissionStatus.notDetermined) return;
      await _permission.request();
    } on Object {
      // 권한 확인·요청 실패. 로그인과 홈 진입을 막지 않고 안내만 한다.
      _toast.show(Copy.notiPermError);
    }
  }
}
