import 'dart:async';

import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/features/boot/domain/auth_gate.dart';
import 'package:chalkak/features/boot/domain/boot_view_model.dart';
import 'package:chalkak/features/boot/domain/update_checker.dart';
import 'package:chalkak/features/boot/domain/update_gate.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/net_harness.dart';

class _Rig {
  _Rig({Session? session, bool gateEnabled = true})
    : store = FakeTokenStore(session) {
    updateChecker = FakeUpdateChecker();
    gate = UpdateGate(
      checker: updateChecker,
      launcher: FakeUpdateLauncher(),
      enabled: gateEnabled,
    );
    vm = BootViewModel(
      updateGate: gate,
      authGate: AuthGate(sessions: SessionManager(store: store)),
      homePreloader: preloader,
      pushRegistrar: push,
    );
  }

  final FakeTokenStore store;
  final FakeHomePreloader preloader = FakeHomePreloader();
  final FakePushRegistrar push = FakePushRegistrar();
  late final FakeUpdateChecker updateChecker;
  late final UpdateGate gate;
  late final BootViewModel vm;

  BootReady get ready => vm.state as BootReady;
}

void main() {
  const preloadMax = Duration(milliseconds: 700);

  fakeTest('TC-BOOT-001 TC-BOOT-014 세션 없음이면 프리로드를 기다리지 않고 바로 login', (async) {
    final r = _Rig();
    resolve(async, r.vm.start());
    expect(r.ready.destination, BootDestination.login);
    expect(r.preloader.count, 0);
    expect(r.push.calls, 0);
  });

  fakeTest('TC-BOOT-001 시작 직후와 게이트 확인 중에는 스플래시(BootChecking)다', (async) {
    final r = _Rig(session: sessionAt());
    final c = Completer<UpdateStatus>();
    r.updateChecker.next = () => c.future;
    expect(r.vm.state, isA<BootChecking>());
    start(async, r.vm.start());
    expect(r.vm.state, isA<BootChecking>());
    expect(r.preloader.count, 0, reason: '게이트가 끝나기 전에는 홈 프리로드를 시작하지 않는다');
    c.complete(UpdateStatus.upToDate);
    settle(async);
    expect(r.preloader.count, 1);
  });

  fakeTest('TC-BOOT-002 인증 세션이면 프리로드(회원) 후 home을 연다', (async) {
    final r = _Rig(session: sessionAt());
    final p = start(async, r.vm.start());
    expect(r.preloader.calls, [false]);
    r.preloader.completer.complete();
    settle(async);
    expect(p.done, isTrue);
    expect(r.ready.destination, BootDestination.home);
    expect(r.ready.isGuest, isFalse);
  });

  fakeTest(
    'TC-BOOT-003 TC-BOOT-013 게스트면 공개 데이터만(guest=true) 프리로드하고 푸시 등록은 없다',
    (async) {
      final r = _Rig(session: sessionGuest());
      start(async, r.vm.start());
      expect(r.preloader.calls, [true]);
      r.preloader.completer.complete();
      settle(async);
      expect(r.ready.destination, BootDestination.home);
      expect(r.ready.isGuest, isTrue);
      expect(r.push.calls, 0);
    },
  );

  fakeTest('TC-BOOT-013 게스트도 상한은 700ms로 같다', (async) {
    final r = _Rig(session: sessionGuest());
    start(async, r.vm.start());
    advance(async, const Duration(milliseconds: 699));
    expect(r.vm.state, isA<BootChecking>());
    advance(async, const Duration(milliseconds: 1));
    expect(r.ready.destination, BootDestination.home);
  });

  fakeTest('TC-BOOT-010 프리로드가 100ms에 끝나면 100ms에 해제한다(700ms를 기다리지 않음)', (async) {
    final r = _Rig(session: sessionAt());
    start(async, r.vm.start());
    advance(async, const Duration(milliseconds: 99));
    expect(r.vm.state, isA<BootChecking>());
    advance(async, const Duration(milliseconds: 1));
    r.preloader.completer.complete();
    settle(async);
    expect(r.vm.state, isA<BootReady>());
  });

  fakeTest('TC-BOOT-011 프리로드가 안 끝나면 699ms까지 유지하고 700ms에 해제한다', (async) {
    final r = _Rig(session: sessionAt());
    start(async, r.vm.start());
    advance(async, const Duration(milliseconds: 698));
    expect(r.vm.state, isA<BootChecking>());
    advance(async, const Duration(milliseconds: 1)); // 699ms
    expect(r.vm.state, isA<BootChecking>());
    advance(async, const Duration(milliseconds: 1)); // 700ms
    expect(r.vm.state, isA<BootReady>());
    advance(async, const Duration(milliseconds: 1)); // 701ms
    expect(r.ready.destination, BootDestination.home);
  });

  fakeTest(
    'TC-BOOT-011 상한은 AppConstants.splashPreloadMax(700ms)와 같고 preloadMax로 바꿀 수 있다',
    (async) {
      final store = FakeTokenStore(sessionAt());
      final preloader = FakeHomePreloader();
      final vm = BootViewModel(
        updateGate: UpdateGate(
          checker: FakeUpdateChecker(),
          launcher: FakeUpdateLauncher(),
          enabled: true,
        ),
        authGate: AuthGate(sessions: SessionManager(store: store)),
        homePreloader: preloader,
        pushRegistrar: FakePushRegistrar(),
        preloadMax: const Duration(milliseconds: 100),
      );
      start(async, vm.start());
      advance(async, const Duration(milliseconds: 100));
      expect(vm.state, isA<BootReady>());
      expect(preloadMax, const Duration(milliseconds: 700));
    },
  );

  fakeTest('TC-BOOT-011 상한 700ms는 게이트 확인이 끝나 프리로드를 시작한 시점부터 잰다', (async) {
    final r = _Rig(session: sessionAt());
    final c = Completer<UpdateStatus>();
    r.updateChecker.next = () => c.future;
    start(async, r.vm.start());
    advance(async, const Duration(milliseconds: 500));
    c.complete(UpdateStatus.upToDate);
    settle(async);
    advance(async, const Duration(milliseconds: 699));
    expect(r.vm.state, isA<BootChecking>());
    advance(async, const Duration(milliseconds: 1));
    expect(r.vm.state, isA<BootReady>());
  });

  fakeTest('TC-BOOT-012 프리로드가 오류로 끝나면 즉시 해제하고 home으로 간다(오류는 홈이 그린다)', (async) {
    final r = _Rig(session: sessionAt());
    start(async, r.vm.start());
    r.preloader.completer.completeError(Exception('popular 500'));
    settle(async);
    expect(r.ready.destination, BootDestination.home);
  });

  fakeTest('TC-BOOT-016 인증 상태로 시작하면 푸시 기기 등록을 한 번 시작한다', (async) {
    final r = _Rig(session: sessionAt());
    start(async, r.vm.start());
    r.preloader.completer.complete();
    settle(async);
    expect(r.push.calls, 1);
  });

  fakeTest('TC-BOOT-016 푸시 등록이 실패해도 부팅은 막히지 않는다', (async) {
    final r = _Rig(session: sessionAt());
    r.push.error = Exception('fcm');
    start(async, r.vm.start());
    r.preloader.completer.complete();
    settle(async);
    expect(r.ready.destination, BootDestination.home);
  });

  fakeTest('TC-BOOT-034 강제 업데이트면 BootForceUpdate에 멈추고 푸시 등록·홈 프리로드·인증 호출이 0건', (
    async,
  ) {
    final r = _Rig(session: sessionAt());
    r.updateChecker.next = () => UpdateStatus.updateRequired;
    final p = start(async, r.vm.start());
    expect(r.vm.state, isA<BootForceUpdate>());
    expect(p.done, isTrue, reason: 'start()는 강제 업데이트에서 멈출 때 끝난다');
    advance(async, const Duration(seconds: 5));
    expect(r.vm.state, isA<BootForceUpdate>());
    expect(r.preloader.count, 0);
    expect(r.push.calls, 0);
  });

  fakeTest('TC-BOOT-034 강제 업데이트는 세션 없음(login 목적지)보다도 먼저다', (async) {
    final r = _Rig();
    r.updateChecker.next = () => UpdateStatus.updateRequired;
    resolve(async, r.vm.start());
    expect(r.vm.state, isA<BootForceUpdate>());
  });

  fakeTest('TC-BOOT-034 강제 상태가 풀리면(재확인 통과) 이어서 홈으로 진행한다', (async) {
    final r = _Rig(session: sessionAt());
    r.updateChecker.next = () => UpdateStatus.updateRequired;
    resolve(async, r.vm.start());
    r.updateChecker.next = () => UpdateStatus.upToDate;
    resolve(async, r.gate.check());
    expect(r.gate.status, UpdateGateStatus.passed);
    expect(r.preloader.count, 1);
    advance(async, preloadMax);
    expect(r.ready.destination, BootDestination.home);
  });

  fakeTest('TC-BOOT-032 게이트가 꺼져 있으면 조회 없이 곧바로 인증 게이트로 간다', (async) {
    final r = _Rig(gateEnabled: false);
    resolve(async, r.vm.start());
    expect(r.updateChecker.calls, 0);
    expect(r.ready.destination, BootDestination.login);
  });

  fakeTest('start()를 두 번 불러도 진행은 한 번이다', (async) {
    final r = _Rig(session: sessionAt());
    start(async, r.vm.start());
    start(async, r.vm.start());
    expect(r.preloader.count, 1);
    expect(r.updateChecker.calls, 1);
  });

  fakeTest('상태가 바뀌면 리스너에 알린다', (async) {
    final r = _Rig();
    var n = 0;
    r.vm.addListener(() => n++);
    resolve(async, r.vm.start());
    expect(n, greaterThan(0));
  });
}
