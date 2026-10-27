import 'package:clock/clock.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import 'net_harness.dart';

/// 가상 시간(기준 시각 [t0] = FIXTURE_NOW)에서 실행하는 테스트. 실제로 기다리지 않는다.
void fakeTest(String name, void Function(FakeAsync async) body) {
  test(name, () {
    fakeAsync((async) {
      body(async);
      settle(async);
    }, initialTime: t0);
  });
}

/// [future]를 끝까지 돌려 값을 꺼낸다(가상 시간은 흘리지 않는다). 끝나지 않으면 실패.
T resolve<T>(FakeAsync async, Future<T> future) {
  final p = Probe<T>(future);
  settle(async);
  if (!p.done) fail('Future가 끝나지 않았다');
  if (p.error != null) throw p.error!;
  return p.value as T;
}

/// 끝나지 않은 채 두고 [Probe]로 관찰한다.
Probe<T> start<T>(FakeAsync async, Future<T> future) {
  final p = Probe<T>(future);
  settle(async);
  return p;
}

/// 위젯 테스트에서 `clock.now()`를 FIXTURE_NOW로 고정한다.
Future<T> atFixtureNow<T>(Future<T> Function() body) =>
    withClock(Clock.fixed(t0), body);
