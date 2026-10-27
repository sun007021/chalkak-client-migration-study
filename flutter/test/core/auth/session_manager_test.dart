import 'package:chalkak/core/auth/session_manager.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fakes.dart';
import '../../support/net_harness.dart';

void main() {
  late FakeTokenStore store;
  late SessionManager sessions;
  late List<SessionClearReason> events;

  setUp(() {
    store = FakeTokenStore();
    sessions = SessionManager(store: store);
    events = [];
    sessions.cleared.listen(events.add);
  });

  test('TC-AUTH-056 clear는 저장소를 비우고 사유와 함께 이벤트를 한 번 낸다', () async {
    await sessions.save(sessionAt());
    await sessions.clear(SessionClearReason.reauthenticationRequired);
    await Future<void>.delayed(Duration.zero);
    expect(await sessions.read(), isNull);
    expect(events, [SessionClearReason.reauthenticationRequired]);
  });

  test('TC-AUTH-052 save한 세션을 read로 돌려준다', () async {
    final s = sessionAt();
    await sessions.save(s);
    expect((await sessions.read())!.accessToken, s.accessToken);
  });

  test(
    'TC-NET-022 saveRefreshed는 현재 세션이 previous와 같을 때 next로 교체하고 true',
    () async {
      final prev = sessionAt();
      await sessions.save(prev);
      final next = sessionAt(at: 'at2', rt: 'rt2');
      expect(await sessions.saveRefreshed(previous: prev, next: next), isTrue);
      expect((await sessions.read())!.refreshToken, 'rt2');
      expect(store.writes.last.accessToken, 'at2');
    },
  );

  test(
    'TC-NET-027 saveRefreshed는 그 사이 로그아웃했으면 저장하지 않고 false(세션을 되살리지 않는다)',
    () async {
      final prev = sessionAt();
      await sessions.save(prev);
      await sessions.clear(SessionClearReason.userLogout);
      final writesBefore = store.writes.length;
      expect(
        await sessions.saveRefreshed(
          previous: prev,
          next: sessionAt(at: 'at2', rt: 'rt2'),
        ),
        isFalse,
      );
      expect(await sessions.read(), isNull);
      expect(store.writes.length, writesBefore);
    },
  );

  test(
    'TC-NET-027 TC-NET-057 saveRefreshed는 계정이 바뀌었으면 저장하지 않고 false',
    () async {
      final prev = sessionAt(userId: 'A', rt: 'rtA');
      await sessions.save(prev);
      final other = sessionAt(userId: 'B', rt: 'rtB');
      await sessions.save(other);
      expect(
        await sessions.saveRefreshed(
          previous: prev,
          next: sessionAt(userId: 'A', at: 'atA2', rt: 'rtA2'),
        ),
        isFalse,
      );
      expect((await sessions.read())!.userId, 'B');
    },
  );
}
