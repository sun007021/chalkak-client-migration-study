import 'dart:async';

import 'package:chalkak/core/network/latest_request_guard.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TC-NET-056 느린 요청 A 뒤에 빠른 요청 B가 오면 늦게 온 A는 버린다', () async {
    final guard = LatestRequestGuard();
    final a = Completer<String>();
    final b = Completer<String>();
    final ra = guard.run(() => a.future);
    final rb = guard.run(() => b.future);
    b.complete('B');
    a.complete('A');
    expect(await rb, 'B');
    expect(await ra, isNull);
  });

  test('TC-NET-056 최신 요청 하나뿐이면 결과를 그대로 돌려준다', () async {
    final guard = LatestRequestGuard();
    expect(await guard.run(() async => 7), 7);
  });

  test('TC-NET-056 이미 끝난 요청 뒤의 새 요청은 정상 반영된다', () async {
    final guard = LatestRequestGuard();
    expect(await guard.run(() async => 1), 1);
    expect(await guard.run(() async => 2), 2);
  });

  test('TC-NET-057 invalidate 이후 도착한 진행 중 응답(계정 전환 전 요청)은 버린다', () async {
    final guard = LatestRequestGuard();
    final a = Completer<String>();
    final r = guard.run(() => a.future);
    guard.invalidate();
    a.complete('계정 A 데이터');
    expect(await r, isNull);
  });

  test('TC-NET-056 task가 예외를 던지면 최신 요청에서는 그대로 전파한다', () async {
    final guard = LatestRequestGuard();
    await expectLater(
      guard.run<int>(() async => throw StateError('x')),
      throwsStateError,
    );
  });
}
