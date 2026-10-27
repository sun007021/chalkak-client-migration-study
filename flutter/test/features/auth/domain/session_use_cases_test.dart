import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/auth/data/api_auth_repository.dart';
import 'package:chalkak/features/auth/data/kakao_social_login_client.dart';
import 'package:chalkak/features/auth/domain/auth_repository.dart';
import 'package:chalkak/features/auth/domain/session_use_cases.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/auth_fakes.dart';
import '../../../support/fake_adapter.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/net_harness.dart';

const _logout = AuthHttpHarness.logoutPath;
const _delete = AuthHttpHarness.deleteMePath;
const _refresh = AuthHttpHarness.refreshPath;

class _Rig {
  _Rig({Session? session, AuthRepository? repository})
    : http = AuthHttpHarness(session: session) {
    final repo = repository ?? ApiAuthRepository(client: http.client);
    logout = LogoutUseCase(
      sessions: http.sessions,
      repository: repo,
      cleaner: cleaner,
    );
    withdraw = WithdrawUseCase(
      sessions: http.sessions,
      repository: repo,
      cleaner: cleaner,
    );
    enterGuest = EnterGuestUseCase(sessions: http.sessions);
    leaveGuest = LeaveGuestUseCase(sessions: http.sessions);
  }

  final AuthHttpHarness http;
  final FakeUserDataCleaner cleaner = FakeUserDataCleaner();
  late final LogoutUseCase logout;
  late final WithdrawUseCase withdraw;
  late final EnterGuestUseCase enterGuest;
  late final LeaveGuestUseCase leaveGuest;
}

void main() {
  group('게스트', () {
    test(
      'TC-AUTH-032 게스트 진입은 서버 호출 없이 자격 증명을 지우고 게스트 세션을 저장한다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        expect(await r.enterGuest(), isTrue);
        final s = r.http.store.current!;
        expect(s.isGuest, isTrue);
        expect(s.accessToken, isEmpty);
        expect(s.refreshToken, isEmpty);
        expect(r.http.adapter.requests, isEmpty);
      }),
    );

    test(
      'TC-AUTH-032 저장된 세션이 없어도 게스트로 들어간다',
      () => atFixtureNow(() async {
        final r = _Rig();
        expect(await r.enterGuest(), isTrue);
        expect(r.http.store.current!.isGuest, isTrue);
      }),
    );

    test(
      'TC-AUTH-032 게스트 플래그 저장이 실패하면 false를 돌려준다(던지지 않는다)',
      () => atFixtureNow(() async {
        final store = _ThrowingWrite();
        final uc = EnterGuestUseCase(sessions: SessionManager(store: store));
        expect(await uc(), isFalse);
      }),
    );

    test(
      'TC-AUTH-033 게스트의 "로그인" 탭은 게스트 플래그를 지우고 cleared 이벤트를 낸다(로그인 화면으로)',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionGuest());
        await r.leaveGuest();
        await pumpEventQueue();
        expect(r.http.store.current, isNull);
        expect(r.http.clearedReasons, [SessionClearReason.userLogout]);
        expect(r.http.adapter.requests, isEmpty);
      }),
    );
  });

  group('로그아웃', () {
    test(
      'TC-AUTH-035 로컬 토큰·캐시를 먼저 지운 뒤 POST /auth/logout {refreshToken}을 보낸다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt(rt: 'rt-live'));
        bool? sessionGoneAtRequest;
        int? cleanedAtRequest;
        r.http.adapter.onDynamic('POST', _logout, (req) {
          sessionGoneAtRequest = r.http.store.current == null;
          cleanedAtRequest = r.cleaner.calls;
          return fixtureResponse('auth/logout__no-content.json');
        });
        await r.logout();
        expect(sessionGoneAtRequest, isTrue);
        expect(cleanedAtRequest, 1);
        expect(r.http.adapter.requests.single.jsonBody, {
          'refreshToken': 'rt-live',
        });
        expect(r.http.adapter.requests.single.hasAuthorization, isFalse);
      }),
    );

    test(
      'TC-AUTH-036 로그아웃이 500·네트워크 오류·401로 실패해도 무시하고 로컬은 이미 지워져 있다',
      () => atFixtureNow(() async {
        final responses = <FakeResponse>[
          fixtureResponse('auth/logout__internal-error.json'),
          const FakeResponse.fault(FakeFault.disconnect),
          fixtureResponse('common/error__unauthorized-token-invalid.json'),
        ];
        for (final resp in responses) {
          final r = _Rig(session: sessionAt());
          r.http.adapter.on('POST', _logout, [resp]);
          await r.logout(); // 던지지 않는다
          expect(r.http.store.current, isNull);
          expect(r.http.adapter.count('POST', _logout), 1, reason: '자동 재시도 금지');
          expect(r.http.adapter.count('POST', _refresh), 0);
        }
      }),
    );

    test(
      'TC-AUTH-036 로그아웃은 cleared(userLogout)를 한 번 낸다(로그인 화면 이동 신호)',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('POST', _logout, [
          fixtureResponse('auth/logout__no-content.json'),
        ]);
        await r.logout();
        await pumpEventQueue();
        expect(r.http.clearedReasons, [SessionClearReason.userLogout]);
      }),
    );

    test(
      'TC-AUTH-038 게스트(refresh token 없음)는 서버 호출 없이 로컬만 정리한다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionGuest());
        await r.logout();
        expect(r.http.adapter.requests, isEmpty);
        expect(r.http.store.current, isNull);
        expect(r.cleaner.calls, 1);
      }),
    );

    test(
      'TC-AUTH-038 세션이 아예 없어도 서버 호출 없이 끝난다',
      () => atFixtureNow(() async {
        final r = _Rig();
        await r.logout();
        expect(r.http.adapter.requests, isEmpty);
      }),
    );

    test(
      'TC-AUTH-039 로그아웃 뒤 푸시 기기 해제 API를 포함해 logout 외 호출은 0건이다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('POST', _logout, [
          fixtureResponse('auth/logout__no-content.json'),
        ]);
        await r.logout();
        expect(r.http.adapter.requests.map((q) => q.path), [_logout]);
      }),
    );

    test(
      'TC-AUTH-040 TC-AUTH-041 로그아웃을 연타해도 요청 1회, 로컬 정리 1회이다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('POST', _logout, [
          fixtureResponse('auth/logout__no-content.json'),
        ]);
        await Future.wait([r.logout(), r.logout(), r.logout()]);
        expect(r.http.adapter.count('POST', _logout), 1);
        expect(r.cleaner.calls, 1);
        expect(r.http.store.clears, 1);
      }),
    );

    test(
      'TC-AUTH-041 로그아웃하면 사용자 캐시 정리(cleaner)를 한 번 호출한다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('POST', _logout, [
          fixtureResponse('auth/logout__no-content.json'),
        ]);
        await r.logout();
        expect(r.cleaner.calls, 1);
      }),
    );

    test(
      'TC-AUTH-035 로그아웃 뒤 다시 로그아웃하면 새 작업으로 처리한다(연타 가드는 진행 중에만)',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('POST', _logout, [
          fixtureResponse('auth/logout__no-content.json'),
        ]);
        await r.logout();
        await r.logout();
        expect(
          r.http.adapter.count('POST', _logout),
          1,
          reason: '두 번째는 세션이 없어 서버 호출 없음',
        );
      }),
    );

    test(
      'TC-AUTH-035 refresh token을 로그에 남기지 않는다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt(rt: 'rt-secret'));
        r.http.adapter.on('POST', _logout, [
          fixtureResponse('auth/logout__internal-error.json'),
        ]);
        await r.logout();
        expect(r.http.logs.all, isNot(contains('rt-secret')));
      }),
    );
  });

  group('회원탈퇴', () {
    test(
      'TC-AUTH-043 204일 때만 로컬 세션·캐시를 지우고 cleared 이벤트를 낸다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        bool? sessionKeptAtRequest;
        int? cleanedAtRequest;
        r.http.adapter.onDynamic('DELETE', _delete, (req) {
          sessionKeptAtRequest = r.http.store.current != null;
          cleanedAtRequest = r.cleaner.calls;
          return fixtureResponse('auth/users-me__delete-no-content.json');
        });
        expect(await r.withdraw(), WithdrawResult.succeeded);
        await pumpEventQueue();
        expect(sessionKeptAtRequest, isTrue);
        expect(cleanedAtRequest, 0);
        expect(r.http.store.current, isNull);
        expect(r.cleaner.calls, 1);
        expect(r.http.clearedReasons, [SessionClearReason.userLogout]);
      }),
    );

    test(
      'TC-AUTH-044 500이면 세션을 유지하고 failed다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('DELETE', _delete, [
          fixtureResponse('auth/users-me__delete-internal-error.json'),
        ]);
        expect(await r.withdraw(), WithdrawResult.failed);
        expect(r.http.store.current, isNotNull);
        expect(r.cleaner.calls, 0);
        expect(r.http.clearedReasons, isEmpty);
      }),
    );

    test(
      'TC-AUTH-044 네트워크 오류여도 세션을 유지하고 failed다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('DELETE', _delete, [
          const FakeResponse.fault(FakeFault.disconnect),
        ]);
        expect(await r.withdraw(), WithdrawResult.failed);
        expect(r.http.store.current, isNotNull);
      }),
    );

    test(
      'TC-AUTH-045 401이면 refresh 후 1회 재전송하고 성공하면 succeeded다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter
          ..on('DELETE', _delete, [
            fixtureResponse('auth/users-me__delete-unauthorized.json'),
            fixtureResponse('auth/users-me__delete-no-content.json'),
          ])
          ..on('POST', _refresh, [
            fixtureResponse('auth/refresh__success.json'),
          ]);
        expect(await r.withdraw(), WithdrawResult.succeeded);
        expect(r.http.adapter.count('DELETE', _delete), 2);
        expect(r.http.adapter.count('POST', _refresh), 1);
        expect(r.http.store.current, isNull);
      }),
    );

    test(
      'TC-AUTH-045 갱신이 실패하면 failed이고 세션을 유지한다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter
          ..on('DELETE', _delete, [
            fixtureResponse('auth/users-me__delete-unauthorized.json'),
          ])
          ..on('POST', _refresh, [
            fixtureResponse('auth/refresh__internal-error.json'),
          ]);
        expect(await r.withdraw(), WithdrawResult.failed);
        expect(r.http.store.current, isNotNull);
        expect(r.cleaner.calls, 0);
      }),
    );

    test(
      'TC-AUTH-046 정지 회원의 탈퇴도 204를 성공으로 처리한다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('DELETE', _delete, [
          fixtureResponse('auth/users-me__delete-no-content.json'),
        ]);
        expect(await r.withdraw(), WithdrawResult.succeeded);
      }),
    );

    test(
      'TC-AUTH-047 탈퇴 성공 뒤 카카오 SDK 연결 해제(unlink) 호출은 0건이다',
      () => atFixtureNow(() async {
        final sdk = FakeKakaoSdkGateway();
        KakaoSocialLoginClient(sdk: sdk); // 탈퇴 유스케이스는 SDK에 접근하지 않는다
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('DELETE', _delete, [
          fixtureResponse('auth/users-me__delete-no-content.json'),
        ]);
        await r.withdraw();
        expect(sdk.calls, isEmpty);
        expect(r.http.adapter.requests.map((q) => q.path), [_delete]);
      }),
    );

    test(
      'TC-AUTH-048 탈퇴를 연타해도 DELETE는 1회다',
      () => atFixtureNow(() async {
        final r = _Rig(session: sessionAt());
        r.http.adapter.on('DELETE', _delete, [
          fixtureResponse('auth/users-me__delete-no-content.json'),
        ]);
        final results = await Future.wait([
          r.withdraw(),
          r.withdraw(),
          r.withdraw(),
        ]);
        expect(r.http.adapter.count('DELETE', _delete), 1);
        expect(results, everyElement(WithdrawResult.succeeded));
        expect(r.cleaner.calls, 1);
      }),
    );

    fakeTest('TC-AUTH-049 요청 중 화면이 사라져도(결과를 버려도) 204가 오면 로컬 세션은 정리된다', (async) {
      final r = _Rig(session: sessionAt());
      r.http.adapter.on('DELETE', _delete, [
        const FakeResponse.empty(204).withDelay(const Duration(seconds: 3)),
      ]);
      start(async, r.withdraw()); // 호출한 화면은 이미 사라졌다고 보고 결과를 보지 않는다
      advance(async, const Duration(seconds: 1));
      expect(r.http.store.current, isNotNull);
      advance(async, const Duration(seconds: 5));
      expect(r.http.store.current, isNull);
      expect(r.cleaner.calls, 1);
    });

    test(
      'TC-AUTH-049 요청 취소(cancelled)는 오류가 아니라 cancelled 결과이고 세션은 유지한다',
      () => atFixtureNow(() async {
        final repo = FakeAuthRepository()
          ..onDelete = () => throw ApiError.cancelled();
        final r = _Rig(session: sessionAt(), repository: repo);
        expect(await r.withdraw(), WithdrawResult.cancelled);
        expect(r.http.store.current, isNotNull);
        expect(r.cleaner.calls, 0);
      }),
    );

    test(
      'TC-AUTH-043 알 수 없는 예외도 failed로 정리하고 세션을 유지한다',
      () => atFixtureNow(() async {
        final repo = FakeAuthRepository()
          ..onDelete = () => throw StateError('x');
        final r = _Rig(session: sessionAt(), repository: repo);
        expect(await r.withdraw(), WithdrawResult.failed);
        expect(r.http.store.current, isNotNull);
      }),
    );
  });
}

class _ThrowingWrite extends FakeTokenStore {
  @override
  Future<void> write(Session session) async => throw StateError('disk');
}
