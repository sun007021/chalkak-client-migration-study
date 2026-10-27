import 'package:chalkak/features/boot/domain/pending_navigation.dart';
import 'package:chalkak/features/boot/domain/update_checker.dart';
import 'package:chalkak/features/boot/domain/update_gate.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_async_helpers.dart';

class _Rig {
  _Rig() {
    gate = UpdateGate(
      checker: checker,
      launcher: FakeUpdateLauncher(),
      enabled: true,
    );
    nav = PendingNavigation(gate: gate, navigate: visited.add);
  }

  final FakeUpdateChecker checker = FakeUpdateChecker();
  final List<String> visited = [];
  late final UpdateGate gate;
  late final PendingNavigation nav;
}

void main() {
  fakeTest('TC-BOOT-035 강제 업데이트 중 푸시 탭은 이동하지 않고 보류한다', (async) {
    final r = _Rig();
    r.checker.next = () => UpdateStatus.updateRequired;
    resolve(async, r.gate.check());
    r.nav.request('/notifications/abc');
    expect(r.visited, isEmpty);
    expect(r.nav.hasPending, isTrue);
  });

  fakeTest('TC-BOOT-035 게이트가 통과된 뒤에만 보류한 이동을 정확히 한 번 처리한다', (async) {
    final r = _Rig();
    r.checker.next = () => UpdateStatus.updateRequired;
    resolve(async, r.gate.check());
    r.nav.request('/notifications/abc');
    r.checker.next = () => UpdateStatus.upToDate;
    resolve(async, r.gate.check());
    expect(r.visited, ['/notifications/abc']);
    expect(r.nav.hasPending, isFalse);
    resolve(async, r.gate.check());
    expect(r.visited, hasLength(1), reason: '다시 처리하지 않는다');
  });

  fakeTest('TC-BOOT-035 확인 중(checking)에도 게이트가 열리기 전에는 보류한다', (async) {
    final r = _Rig();
    r.nav.request('/home');
    expect(r.visited, isEmpty);
    resolve(async, r.gate.check());
    expect(r.visited, ['/home']);
  });

  fakeTest('TC-BOOT-035 게이트가 이미 통과 상태면 바로 이동한다', (async) {
    final r = _Rig();
    resolve(async, r.gate.check());
    r.nav.request('/feed/1');
    expect(r.visited, ['/feed/1']);
  });

  fakeTest('TC-BOOT-035 보류는 마지막 요청 하나만 남긴다', (async) {
    final r = _Rig();
    r.nav.request('/a');
    r.nav.request('/b');
    resolve(async, r.gate.check());
    expect(r.visited, ['/b']);
  });

  fakeTest('TC-AUTH-036 로그아웃(clearAll) 시점의 보류 이동은 폐기한다', (async) {
    final r = _Rig();
    r.nav.request('/notifications/abc');
    resolve(async, r.nav.clearAll());
    expect(r.nav.hasPending, isFalse);
    resolve(async, r.gate.check());
    expect(r.visited, isEmpty);
  });

  fakeTest('TC-AUTH-058 discard()도 보류 이동을 버린다', (async) {
    final r = _Rig();
    r.nav.request('/x');
    r.nav.discard();
    resolve(async, r.gate.check());
    expect(r.visited, isEmpty);
  });
}
