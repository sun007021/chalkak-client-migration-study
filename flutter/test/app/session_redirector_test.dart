import 'package:chalkak/app/app_routes.dart';
import 'package:chalkak/app/session_redirector.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/network/api_request.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/auth_fakes.dart';
import '../support/fakes.dart';
import '../support/net_harness.dart';

void main() {
  late FakeTokenStore store;
  late SessionManager sessions;
  late FakeUserDataCleaner cleaner;
  late List<String> visited;
  late SessionRedirector redirector;

  setUp(() {
    store = FakeTokenStore(sessionAt());
    sessions = SessionManager(store: store);
    cleaner = FakeUserDataCleaner();
    visited = [];
    redirector = SessionRedirector(
      sessions: sessions,
      cleaner: cleaner,
      goTo: visited.add,
    )..start();
  });

  tearDown(() => redirector.dispose());

  test(
    'TC-AUTH-056 REAUTHENTICATION_REQUIRED로 세션이 지워지면 로그인으로 보내고 캐시를 지운다',
    () async {
      await sessions.clear(SessionClearReason.reauthenticationRequired);
      await pumpEventQueue();
      expect(visited, [AppRoutes.login]);
      expect(cleaner.calls, 1);
      expect(store.current, isNull);
    },
  );

  test('TC-AUTH-056 로그아웃·탈퇴(userLogout)도 로그인으로 보내지만 캐시는 유스케이스가 지운다', () async {
    await sessions.clear(SessionClearReason.userLogout);
    await pumpEventQueue();
    expect(visited, [AppRoutes.login]);
    expect(cleaner.calls, 0);
  });

  test('TC-AUTH-056 dispose 뒤에는 반응하지 않는다', () async {
    redirector.dispose();
    await sessions.clear(SessionClearReason.reauthenticationRequired);
    await pumpEventQueue();
    expect(visited, isEmpty);
  });

  test('TC-AUTH-056 start()를 두 번 불러도 이동은 한 번이다', () async {
    redirector.start();
    await sessions.clear(SessionClearReason.reauthenticationRequired);
    await pumpEventQueue();
    expect(visited, hasLength(1));
  });

  test(
    'TC-AUTH-051 탈퇴 후 이전 액세스 토큰 호출이 401이고 refresh가 REAUTH면 세션을 지우고 로그인으로 간다',
    () async {
      final h = AuthHttpHarness(session: sessionAt());
      final seen = <String>[];
      final r = SessionRedirector(
        sessions: h.sessions,
        cleaner: cleaner,
        goTo: seen.add,
      )..start();
      h.adapter
        ..on('GET', '$v1/posts/today', [
          fixtureResponse('common/error__unauthorized-token-invalid.json'),
        ])
        ..on('POST', AuthHttpHarness.refreshPath, [
          fixtureResponse('auth/refresh__reauthentication-required.json'),
        ]);
      await expectLater(
        h.client.requestNoContent(const ApiRequest.get('/posts/today')),
        throwsA(isA<ApiError>()),
      );
      await pumpEventQueue();
      expect(h.store.current, isNull);
      expect(seen, [AppRoutes.login]);
      expect(h.adapter.count('POST', AuthHttpHarness.refreshPath), 1);
      r.dispose();
    },
  );
}
