import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/push/notification_permission.dart';
import 'package:chalkak/features/notification/domain/notification_permission_prompt.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/notification_fakes.dart';

class _Rig {
  _Rig({
    OsPermissionStatus status = OsPermissionStatus.notDetermined,
    bool requested = false,
  }) : permission = FakeNotificationPermission(status),
       flag = FakePermissionFlag(requested) {
    prompt = NotificationPermissionPrompt(
      permission: permission,
      flag: flag,
      toast: toast,
    );
  }

  final FakeNotificationPermission permission;
  final FakePermissionFlag flag;
  final RecordingToast toast = RecordingToast();
  late final NotificationPermissionPrompt prompt;
}

void main() {
  fakeTest('TC-PUSH-001 미결정이면 앱 안내 없이 OS 권한 요청만 1회 호출하고 요청함을 저장한다', (async) {
    final r = _Rig();
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    expect(r.permission.requests, 1);
    expect(r.flag.requested, isTrue);
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('TC-PUSH-003 TC-PUSH-009 요청한 뒤에는 홈 재진입·앱 재시작에도 다시 요청하지 않는다', (
    async,
  ) {
    final r = _Rig();
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    // 앱 재시작: 같은 플래그, 새 객체
    final restarted = NotificationPermissionPrompt(
      permission: r.permission,
      flag: r.flag,
      toast: r.toast,
    );
    resolve(async, restarted.onMainEntered(isGuest: false));
    expect(r.permission.requests, 1);
    expect(r.flag.marks, 1);
  });

  fakeTest('REQ-PUSH-001 요청을 띄운 시점에 표시를 저장한다(요청 호출이 실패해도 남는다)', (async) {
    final r = _Rig();
    r.permission.requestError = StateError('os');
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    expect(r.flag.requested, isTrue);
  });

  fakeTest('TC-PUSH-004 게스트는 권한 요청도 요청함 표시도 없다', (async) {
    final r = _Rig();
    resolve(async, r.prompt.onMainEntered(isGuest: true));
    expect(r.permission.requests, 0);
    expect(r.permission.statusCalls, 0);
    expect(r.flag.marks, 0);
  });

  fakeTest('REQ-PUSH-004 이미 허용·거부로 결정된 상태면 대화상자 없이 요청함 표시만 저장한다', (async) {
    for (final status in [
      OsPermissionStatus.granted,
      OsPermissionStatus.denied,
    ]) {
      final r = _Rig(status: status);
      resolve(async, r.prompt.onMainEntered(isGuest: false));
      expect(r.permission.requests, 0, reason: '$status');
      expect(r.flag.requested, isTrue, reason: '$status');
      expect(r.toast.messages, isEmpty);
    }
  });

  fakeTest('TC-PUSH-007 OS 권한 요청 호출이 오류면 notiPermError 토스트를 보인다', (async) {
    final r = _Rig();
    r.permission.requestError = StateError('os');
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    expect(r.toast.messages, [Copy.notiPermError]);
  });

  fakeTest('TC-PUSH-008 런타임 권한이 없는 Android 12 이하는 요청 없이 진행한다', (async) {
    final r = _Rig(status: OsPermissionStatus.notRequired);
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    expect(r.permission.requests, 0);
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('TC-PUSH-010 가입 완료 직후 첫 메인 진입도 로그인 후 첫 진입과 같게 1회 대상이다', (async) {
    final r = _Rig();
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    expect(r.permission.requests, 1);
  });

  fakeTest('TC-PUSH-011 다른 계정으로 로그인해도 기기 단위 표시라 다시 요청하지 않는다', (async) {
    final r = _Rig(requested: true);
    resolve(async, r.prompt.onMainEntered(isGuest: false));
    expect(r.permission.requests, 0);
    expect(r.permission.statusCalls, 0);
  });
}
