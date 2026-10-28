import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_adapter.dart';
import '../../support/net_harness.dart';

void main() {
  netTest('refreshSession은 refresh를 1회 보내고 저장된 새 세션을 돌려준다', (h, a) {
    h.adapter.on('POST', '$v1/auth/refresh', [
      FakeResponse.json(200, refreshBody('at2', 'rt2')),
    ]);
    final r = Probe(h.client.refreshSession());
    settle(a);
    expect(r.value!.accessToken, 'at2');
    expect(h.refreshCalls, 1);
    expect(h.store.current!.refreshToken, 'rt2');
  }, session: sessionAt());

  netTest('refreshSession을 동시에 두 번 불러도 refresh는 1회다(single-flight 공유)', (h, a) {
    h.adapter.on('POST', '$v1/auth/refresh', [
      FakeResponse.json(
        200,
        refreshBody('at2', 'rt2'),
      ).withDelay(const Duration(milliseconds: 100)),
    ]);
    final first = Probe(h.client.refreshSession());
    final second = Probe(h.client.refreshSession());
    advance(a, const Duration(seconds: 1));
    expect(first.value!.refreshToken, 'rt2');
    expect(second.value!.refreshToken, 'rt2');
    expect(h.refreshCalls, 1);
  }, session: sessionAt());

  netTest('게스트·세션 없음이면 요청 없이 null이다', (h, a) {
    final r = Probe(h.client.refreshSession());
    settle(a);
    expect(r.done, isTrue);
    expect(r.value, isNull);
    expect(h.refreshCalls, 0);
  });

  netTest('REAUTHENTICATION_REQUIRED면 세션을 지우고 ApiError를 던진다', (h, a) {
    h.adapter.on('POST', '$v1/auth/refresh', [reauth()]);
    final r = Probe(h.client.refreshSession());
    settle(a);
    expect((r.error! as ApiError).isReauthenticationRequired, isTrue);
    expect(h.clearedEvents, [SessionClearReason.reauthenticationRequired]);
    expect(h.store.current, isNull);
    // 세션이 지워졌으므로 이어서 불러도 요청이 없다(푸시 등록이 반복하지 않는 근거).
    final again = Probe(h.client.refreshSession());
    settle(a);
    expect(again.value, isNull);
    expect(h.refreshCalls, 1);
  }, session: sessionAt());
}
