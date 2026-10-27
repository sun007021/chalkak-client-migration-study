import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/network/http_transport.dart';
import 'package:chalkak/core/network/token_refresher.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/net_harness.dart';

void main() {
  TokenRefresher refresherOf(NetHarness h) => TokenRefresher(
    transport: HttpTransport(adapter: h.adapter),
    sessions: h.sessions,
    apiRoot: Uri.parse('$apiHost$v1'),
  );

  netTest('REQ-NET-019 이미 회전된 refresh token으로 부르면 서버에 보내지 않고 저장된 새 세션을 돌려준다', (
    h,
    a,
  ) {
    final r = Probe(refresherOf(h).refresh(sessionAt(at: 'at1', rt: 'rt1')));
    settle(a);
    expect(r.value?.refreshToken, 'rt2');
    expect(h.refreshCalls, 0);
  }, session: sessionAt(at: 'at2', rt: 'rt2'));

  netTest('REQ-NET-021 저장된 세션이 없으면(로그아웃) 보내지 않고 cancelled다', (h, a) {
    final r = Probe(refresherOf(h).refresh(sessionAt()));
    settle(a);
    expect((r.error! as ApiError).isCancelled, isTrue);
    expect(h.refreshCalls, 0);
  });

  netTest('REQ-NET-021 다른 계정으로 전환됐으면 보내지 않고 cancelled다', (h, a) {
    final r = Probe(refresherOf(h).refresh(sessionAt(userId: 'user-1')));
    settle(a);
    expect((r.error! as ApiError).isCancelled, isTrue);
    expect(h.refreshCalls, 0);
  }, session: sessionAt(userId: 'user-2', rt: 'rtX'));
}
