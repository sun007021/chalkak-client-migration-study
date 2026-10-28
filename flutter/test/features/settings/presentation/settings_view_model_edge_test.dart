import 'dart:async';

import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/features/settings/presentation/settings_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, sessionAt, settle;
import '../../../support/onboarding_fakes.dart' show meSignaturePath;
import '../../../support/settings_fakes.dart';

const _sigOk = 'signature/users-me-signature__get-success.json';
const _pushAllTrue = 'settings/notification-settings__get-all-true.json';

/// 화면이 사라지거나 계정이 바뀌는 사이에 끝나는 요청과 연타.
void main() {
  fakeTest('REQ-SET-007 로그아웃 확인을 연타해도 서버 로그아웃은 한 번이다', (async) {
    final r = SettingsRig();
    r.vm.onLogoutRowPressed();
    r.vm.onLogoutConfirmed();
    r.vm.onLogoutConfirmed();
    advance(async, Duration.zero);
    expect(r.auth.logoutTokens, ['rt1']);
    expect(r.h.clearedReasons, [SessionClearReason.userLogout]);
  });

  fakeTest('REQ-SET-007 확인 대화상자가 없는데 확인이 들어와도 아무 요청도 만들지 않는다', (async) {
    final r = SettingsRig();
    r.vm.onLogoutConfirmed();
    r.vm.onWithdrawConfirmed();
    advance(async, Duration.zero);
    expect(r.auth.logoutTokens, isEmpty);
    expect(r.auth.deleteCalls, 0);
    expect(r.h.store.current, isNotNull);
  });

  fakeTest('REQ-SET-007 탈퇴 처리 중에는 취소로 대화상자를 닫을 수 없다', (async) {
    final r = SettingsRig();
    final gate = Completer<void>();
    r.auth.onDelete = () => gate.future;
    r.vm.onWithdrawRowPressed();
    r.vm.onWithdrawConfirmed();
    settle(async);
    r.vm.onDialogCancelled();
    expect(r.vm.state.dialog, SettingsDialog.withdraw);
    gate.complete();
    settle(async);
    expect(r.vm.state.dialog, isNull);
  });

  fakeTest('REQ-SET-007 탈퇴 처리 중 화면이 사라져도 성공하면 정리가 끝까지 되고 예외가 없다', (async) {
    final r = SettingsRig();
    final gate = Completer<void>();
    r.auth.onDelete = () => gate.future;
    r.vm.onWithdrawRowPressed();
    r.vm.onWithdrawConfirmed();
    settle(async);
    r.vm.dispose();
    gate.complete();
    settle(async);
    expect(r.otherCleaner.calls, 1);
    expect(r.h.store.current, isNull);
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('REQ-SET-007 탈퇴 처리 중 화면이 사라진 뒤 실패해도 토스트를 띄우지 않는다', (async) {
    final r = SettingsRig();
    final gate = Completer<void>();
    r.auth.onDelete = () async {
      await gate.future;
      throw serverError(500);
    };
    r.vm.onWithdrawRowPressed();
    r.vm.onWithdrawConfirmed();
    settle(async);
    r.vm.dispose();
    gate.complete();
    settle(async);
    expect(r.toast.messages, isEmpty);
    expect(r.h.store.current, isNotNull);
  });

  fakeTest('TC-SET-007 계정이 바뀐 뒤의 진입은 이전 계정의 진행 중 조회에 묻히지 않는다', (async) {
    final r = SettingsRig();
    r.h.adapter.on('GET', meSignaturePath, [
      fx(_sigOk, delay: const Duration(seconds: 5)),
    ]);
    r.onGetPush([fx(_pushAllTrue, delay: const Duration(seconds: 5))]);
    r.vm.onTabShown();
    settle(async);
    expect(r.pushGets, 1);
    r.vm.clearAll();
    settle(async);
    r.vm.onTabShown();
    advance(async, const Duration(seconds: 1));
    expect(r.signatureGets, 2);
    expect(r.pushGets, 2);
  });

  fakeTest('TC-SET-037 비운 뒤 늦게 도착한 이전 계정의 사인 응답은 카드에 반영하지 않는다', (async) {
    final r = SettingsRig();
    r.h.adapter.on('GET', meSignaturePath, [
      fx(_sigOk, delay: const Duration(seconds: 2)),
    ]);
    r.onGetPush([fx(_pushAllTrue)]);
    r.show(async);
    r.vm.clearAll();
    advance(async, const Duration(seconds: 3));
    expect(r.card.imageUrl, isNull);
    expect(r.card.status.name, 'idle');
  });

  fakeTest('REQ-SET-002 게스트의 로그인 버튼을 연타해도 예외 없이 세션을 지운다', (async) {
    final r = SettingsRig(guest: true);
    r.vm.onLoginPressed();
    r.vm.onLoginPressed();
    advance(async, Duration.zero);
    expect(r.h.clearedReasons, isNotEmpty);
  });

  fakeTest('TC-SET-052 dispose 뒤의 진입과 이벤트는 아무 일도 하지 않는다', (async) {
    final r = SettingsRig();
    r.vm.dispose();
    r.vm.onTabShown();
    r.vm.onFeedbackPressed();
    r.vm.onPrivacyPressed();
    advance(async, Duration.zero);
    expect(r.analytics.screenNames, isEmpty);
    expect(r.events, isEmpty);
    expect(r.h.adapter.requests, isEmpty);
    expect(r.toast.messages, isEmpty);
  });

  fakeTest('TC-SET-037 다른 계정으로 로그인한 뒤에도 같은 설정 ViewModel이 새로 조회한다', (async) {
    final r = SettingsRig();
    r.h.onGetSignature([_sigOk]);
    r.onGetPush([fx(_pushAllTrue)]);
    r.show(async);
    r.vm.clearAll();
    r.h.sessions.save(sessionAt(userId: 'user-2'));
    advance(async, Duration.zero);
    r.show(async);
    expect(r.signatureGets, 2);
    expect(r.pushGets, 2);
  });
}
