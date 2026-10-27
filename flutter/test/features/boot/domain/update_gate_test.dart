import 'dart:async';

import 'package:chalkak/features/boot/domain/update_checker.dart';
import 'package:chalkak/features/boot/domain/update_gate.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart';

void main() {
  late FakeUpdateChecker checker;
  late FakeUpdateLauncher launcher;
  late StreamController<void> signals;

  UpdateGate gate({bool enabled = true}) {
    checker = FakeUpdateChecker();
    launcher = FakeUpdateLauncher();
    signals = StreamController<void>.broadcast();
    return UpdateGate(
      checker: checker,
      launcher: launcher,
      enabled: enabled,
      recheckSignals: signals.stream,
    );
  }

  fakeTest('TC-BOOT-002 확인이 끝나기 전에는 checking(스플래시 유지)이다', (async) {
    final g = gate();
    final completer = Completer<UpdateStatus>();
    checker.next = () => completer.future;
    expect(g.status, UpdateGateStatus.checking);
    final p = start(async, g.check());
    expect(p.done, isFalse);
    expect(g.status, UpdateGateStatus.checking);
    completer.complete(UpdateStatus.upToDate);
    settle(async);
    expect(g.status, UpdateGateStatus.passed);
  });

  fakeTest('TC-BOOT-016 필수 판정이면 forced가 된다', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    expect(g.status, UpdateGateStatus.forced);
  });

  fakeTest('TC-BOOT-023 조회 불가(네트워크·5xx)는 앱을 막지 않고 통과한다', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.unavailable;
    resolve(async, g.check());
    expect(g.status, UpdateGateStatus.passed);
  });

  fakeTest('TC-BOOT-023 checker가 예외를 던져도 통과한다', (async) {
    final g = gate();
    checker.next = () => throw Exception('boom');
    resolve(async, g.check());
    expect(g.status, UpdateGateStatus.passed);
  });

  fakeTest('TC-BOOT-025 오프라인(unavailable)은 통과하고 온라인 신호에 재조회해 강제면 띄운다', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.unavailable;
    resolve(async, g.check());
    expect(g.status, UpdateGateStatus.passed);

    checker.next = () => UpdateStatus.updateRequired;
    signals.add(null); // 온라인 전환
    settle(async);
    expect(checker.calls, 2);
    expect(g.status, UpdateGateStatus.forced);
  });

  fakeTest('TC-BOOT-026 이미 강제로 확인된 뒤 재조회가 unavailable이어도 강제를 유지한다', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    checker.next = () => UpdateStatus.unavailable;
    resolve(async, g.check());
    expect(g.status, UpdateGateStatus.forced);
  });

  fakeTest('TC-BOOT-026 강제 뒤 재조회가 upToDate(이미 업데이트함)면 풀린다', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    checker.next = () => UpdateStatus.upToDate;
    resolve(async, g.check());
    expect(g.status, UpdateGateStatus.passed);
  });

  fakeTest('TC-BOOT-027 앱 복귀 신호에 재확인하고 새로 강제 대상이면 forced', (async) {
    final g = gate();
    resolve(async, g.check());
    expect(g.status, UpdateGateStatus.passed);
    checker.next = () => UpdateStatus.updateRequired;
    signals.add(null); // scene active
    settle(async);
    expect(g.status, UpdateGateStatus.forced);
  });

  fakeTest('TC-BOOT-029 "업데이트"를 연타해도 launcher는 1회다', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    launcher.gate = Completer<void>();
    final a = start(async, g.openStore());
    final b = start(async, g.openStore());
    final c = start(async, g.openStore());
    expect(launcher.calls, 1);
    launcher.gate!.complete();
    settle(async);
    expect([a.done, b.done, c.done], everyElement(isTrue));
    expect(launcher.calls, 1);
  });

  fakeTest('TC-BOOT-031 업데이트 흐름이 실패·취소돼도 앱을 통과시키지 않고 forced 유지', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    launcher.error = Exception('user cancelled');
    resolve(async, g.openStore()); // 예외가 밖으로 새지 않는다
    expect(g.status, UpdateGateStatus.forced);
  });

  fakeTest('TC-BOOT-031 업데이트 후에도 우선순위가 남아 있으면 다시 강제로 남는다', (async) {
    final g = gate();
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    resolve(async, g.openStore());
    expect(g.status, UpdateGateStatus.forced);
  });

  fakeTest('TC-BOOT-032 설정으로 끄면 조회 0건이고 통과한다', (async) {
    final g = gate(enabled: false);
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    expect(checker.calls, 0);
    expect(g.status, UpdateGateStatus.passed);
  });

  fakeTest('TC-BOOT-032 꺼진 게이트는 재확인 신호에도 조회하지 않는다', (async) {
    final g = gate(enabled: false);
    resolve(async, g.check());
    signals.add(null);
    settle(async);
    expect(checker.calls, 0);
  });

  fakeTest('조회가 겹쳐도 checker는 한 번에 하나만 진행한다', (async) {
    final g = gate();
    final c = Completer<UpdateStatus>();
    checker.next = () => c.future;
    final a = start(async, g.check());
    final b = start(async, g.check());
    expect(checker.calls, 1);
    c.complete(UpdateStatus.upToDate);
    settle(async);
    expect(a.done && b.done, isTrue);
  });

  fakeTest('status가 바뀌면 리스너에 알린다', (async) {
    final g = gate();
    var notified = 0;
    g.addListener(() => notified++);
    checker.next = () => UpdateStatus.updateRequired;
    resolve(async, g.check());
    expect(notified, greaterThan(0));
  });
}
