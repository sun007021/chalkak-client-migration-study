import 'dart:async';

import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/core/network/api_request.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_adapter.dart';
import '../../support/net_harness.dart';

ApiError errOf(Probe<Object?> p) => p.error! as ApiError;

Probe<Object?> get(NetHarness h, String path, {CancelToken? cancel}) =>
    Probe<Object?>(
      h.client.request<Object?>(
        ApiRequest.get(path),
        decode: (j) => j,
        cancelToken: cancel,
      ),
    );

String? auth(RecordedRequest r) => r.header('authorization');

List<RecordedRequest> reqs(NetHarness h, String path) =>
    h.adapter.where('GET', '$v1$path').toList();

/// 토큰이 at1이면 401, 그 외에는 200.
void expireAt1(NetHarness h, String path) {
  h.adapter.onDynamic(
    'GET',
    '$v1$path',
    (r) => auth(r) == 'Bearer at1' || auth(r) == null ? unauthorized() : ok(),
  );
}

void scriptRefresh(
  NetHarness h, {
  String at = 'at2',
  String rt = 'rt2',
  Duration delay = Duration.zero,
}) {
  h.adapter.on('POST', '$v1/auth/refresh', [
    FakeResponse.json(200, refreshBody(at, rt)).withDelay(delay),
  ]);
}

void main() {
  group('401 갱신 기본 흐름', () {
    netTest('TC-NET-012 401이면 refresh 1회 후 원 요청을 정확히 1회 재전송해 성공을 돌려준다', (h, a) {
      expireAt1(h, '/a');
      scriptRefresh(h);
      final r = get(h, '/a');
      settle(a);
      expect(r.succeeded, isTrue);
      final sent = reqs(h, '/a');
      expect(sent.map(auth), ['Bearer at1', 'Bearer at2']);
      expect(h.refreshCalls, 1);
      expect(h.adapter.where('POST', '$v1/auth/refresh').single.jsonBody, {
        'refreshToken': 'rt1',
      });
      // 요청 순서: 원 요청 → refresh → 재전송
      final order = h.adapter.requests.map((e) => e.apiPath).toList();
      expect(order, ['/a', '/auth/refresh', '/a']);
    }, session: sessionAt());

    netTest('TC-NET-014 TC-AUTH-054 만료된 access는 헤더를 생략하고 서버 401 뒤 갱신 경로로 간다', (
      h,
      a,
    ) {
      expireAt1(h, '/a');
      scriptRefresh(h);
      final r = get(h, '/a');
      settle(a);
      final sent = reqs(h, '/a');
      expect(sent.first.hasAuthorization, isFalse);
      expect(sent.last.hasAuthorization, isTrue);
      expect(auth(sent.last), 'Bearer at2');
      expect(h.refreshCalls, 1);
      expect(r.succeeded, isTrue);
    }, session: sessionAt(accessLeft: const Duration(seconds: -1)));

    netTest(
      'TC-NET-030 만료 토큰을 보낸 공개 API(GET /posts, /topics)도 refresh 후 재전송한다',
      (h, a) {
        for (final p in ['/posts', '/topics']) {
          expireAt1(h, p);
        }
        scriptRefresh(h);
        final r1 = get(h, '/posts');
        settle(a);
        final r2 = get(h, '/topics');
        settle(a);
        expect(r1.succeeded && r2.succeeded, isTrue);
        expect(reqs(h, '/posts'), hasLength(2));
        expect(reqs(h, '/topics'), hasLength(2));
        expect(auth(reqs(h, '/posts').last), 'Bearer at2');
      },
      session: sessionAt(accessLeft: const Duration(seconds: -1)),
    );

    netTest('TC-NET-022 refresh 성공 응답의 두 토큰을 한 번에 저장하고 만료 시각을 계산한다', (h, a) {
      expireAt1(h, '/a');
      scriptRefresh(h, at: 'at2', rt: 'rt2');
      get(h, '/a');
      settle(a);
      expect(h.store.writes, hasLength(1));
      final s = h.store.writes.single;
      expect(
        (s.accessToken, s.refreshToken, s.userId),
        ('at2', 'rt2', 'user-1'),
      );
      expect(s.accessTokenExpiresAt, t0.add(const Duration(seconds: 900)));
      expect(s.refreshTokenExpiresAt, t0.add(const Duration(seconds: 2592000)));
    }, session: sessionAt());

    netTest('TC-NET-022 저장이 끝나기 전에는 원 요청을 재전송하지 않는다', (h, a) {
      expireAt1(h, '/a');
      scriptRefresh(h);
      final gate = Completer<void>();
      h.store.writeGate = gate.future;
      final r = get(h, '/a');
      settle(a);
      expect(h.refreshCalls, 1);
      expect(reqs(h, '/a'), hasLength(1));
      expect(r.done, isFalse);
      gate.complete();
      settle(a);
      expect(reqs(h, '/a'), hasLength(2));
      expect(r.succeeded, isTrue);
    }, session: sessionAt());

    netTest('TC-NET-029 refresh token은 한 번 쓰면 다시 보내지 않는다(회전된 토큰만 보낸다)', (h, a) {
      h.adapter.onDynamic('GET', '$v1/a', (r) {
        final t = auth(r);
        return t == 'Bearer at3' ? ok() : unauthorized();
      });
      var n = 0;
      h.adapter.onDynamic('POST', '$v1/auth/refresh', (r) {
        n++;
        return FakeResponse.json(200, refreshBody('at${n + 1}', 'rt${n + 1}'));
      });
      get(h, '/a');
      settle(a);
      // 두 번째 갱신이 필요한 상황: at2도 401
      expect(h.refreshTokensSent, ['rt1']);
      get(h, '/a');
      settle(a);
      expect(
        h.refreshTokensSent.toSet(),
        hasLength(h.refreshTokensSent.length),
      );
      expect(h.refreshTokensSent.first, 'rt1');
    }, session: sessionAt());
  });

  group('single-flight', () {
    netTest(
      'TC-NET-015 TC-NET-029 동시에 401을 받아도 refresh는 1건이고 각 요청은 새 토큰으로 1회씩 재전송된다',
      (h, a) {
        for (final p in ['/a', '/b', '/c']) {
          expireAt1(h, p);
        }
        scriptRefresh(h, delay: const Duration(seconds: 1));
        final rs = [get(h, '/a'), get(h, '/b'), get(h, '/c')];
        advance(a, const Duration(seconds: 3));
        expect(rs.every((r) => r.succeeded), isTrue);
        expect(h.refreshCalls, 1);
        expect(h.refreshTokensSent, ['rt1']);
        for (final p in ['/a', '/b', '/c']) {
          final sent = reqs(h, p);
          expect(sent, hasLength(2), reason: p);
          expect(auth(sent.last), 'Bearer at2', reason: p);
        }
        expect(h.store.writes, hasLength(1));
      },
      session: sessionAt(),
    );

    netTest(
      'TC-NET-016 401을 받는 사이 다른 요청이 이미 토큰을 갱신했으면 refresh 없이 새 토큰으로 재전송한다',
      (h, a) {
        var first = true;
        h.adapter.onDynamic('GET', '$v1/a', (r) {
          if (first) {
            first = false;
            return unauthorized().withDelay(const Duration(seconds: 1));
          }
          return ok();
        });
        final r = get(h, '/a');
        advance(a, const Duration(milliseconds: 500));
        // 다른 요청이 갱신을 끝내 저장소가 바뀜
        unawaited(h.sessions.save(sessionAt(at: 'at2', rt: 'rt2')));
        advance(a, const Duration(seconds: 2));
        expect(h.refreshCalls, 0);
        expect(auth(reqs(h, '/a').last), 'Bearer at2');
        expect(r.succeeded, isTrue);
      },
      session: sessionAt(),
    );
  });

  group('재전송 이후', () {
    netTest('TC-NET-017 재전송한 요청이 다시 401이면 더 보내지 않고 오류를 돌려주며 세션을 지우지 않는다', (
      h,
      a,
    ) {
      h.adapter.on('GET', '$v1/a', [unauthorized()]);
      scriptRefresh(h);
      final r = get(h, '/a');
      advance(a, const Duration(seconds: 30));
      expect(errOf(r).isUnauthorized, isTrue);
      expect(reqs(h, '/a'), hasLength(2));
      expect(h.refreshCalls, 1);
      expect(h.store.current?.refreshToken, 'rt2'); // 갱신 결과는 저장, 세션은 유지
      expect(h.clearedEvents, isEmpty);
    }, session: sessionAt());

    netTest(
      'TC-NET-018 TC-AUTH-056 재전송한 요청이 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 이벤트를 낸다',
      (h, a) {
        h.adapter.on('GET', '$v1/a', [unauthorized(), reauth()]);
        scriptRefresh(h);
        final r = get(h, '/a');
        settle(a);
        expect(errOf(r).isReauthenticationRequired, isTrue);
        expect(reqs(h, '/a'), hasLength(2));
        expect(h.store.current, isNull);
        expect(h.clearedEvents, [SessionClearReason.reauthenticationRequired]);
      },
      session: sessionAt(),
    );

    netTest(
      'TC-NET-019 늦게 도착한 REAUTH 응답인데 그 사이 토큰이 갱신됐으면 새 토큰으로 1회 재시도하고 세션은 유지한다',
      (h, a) {
        var first = true;
        h.adapter.onDynamic('GET', '$v1/a', (r) {
          if (first) {
            first = false;
            return reauth().withDelay(const Duration(seconds: 1));
          }
          return ok();
        });
        final r = get(h, '/a');
        advance(a, const Duration(milliseconds: 500));
        unawaited(h.sessions.save(sessionAt(at: 'at2', rt: 'rt2')));
        advance(a, const Duration(seconds: 2));
        expect(r.succeeded, isTrue);
        expect(h.refreshCalls, 0);
        expect(auth(reqs(h, '/a').last), 'Bearer at2');
        expect(h.store.current?.accessToken, 'at2');
        expect(h.clearedEvents, isEmpty);
      },
      session: sessionAt(),
    );
  });

  group('REAUTHENTICATION_REQUIRED', () {
    netTest(
      'TC-NET-020 TC-AUTH-056 일반 API의 REAUTH는 refresh를 부르지 않고 세션을 지운 뒤 로그인 이벤트를 낸다',
      (h, a) {
        h.adapter.on('GET', '$v1/a', [reauth()]);
        final r = get(h, '/a');
        settle(a);
        expect(errOf(r).isReauthenticationRequired, isTrue);
        expect(h.refreshCalls, 0);
        expect(reqs(h, '/a'), hasLength(1));
        expect(h.store.current, isNull);
        expect(h.clearedEvents, [SessionClearReason.reauthenticationRequired]);
      },
      session: sessionAt(),
    );

    netTest(
      'TC-NET-021 TC-AUTH-056 refresh 자체가 REAUTH면 세션을 지우고 로그인 이벤트를 한 번 낸다',
      (h, a) {
        // fixture: auth/refresh__reauthentication-required.json
        h.adapter.on('GET', '$v1/a', [unauthorized()]);
        h.adapter.on('POST', '$v1/auth/refresh', [reauth()]);
        final r = get(h, '/a');
        advance(a, const Duration(seconds: 30));
        expect(errOf(r).isReauthenticationRequired, isTrue);
        expect(reqs(h, '/a'), hasLength(1)); // 재전송 없음
        expect(h.refreshCalls, 1);
        expect(h.store.current, isNull);
        expect(h.clearedEvents, [SessionClearReason.reauthenticationRequired]);
      },
      session: sessionAt(),
    );

    netTest('TC-NET-021 동시 요청 여러 개가 같은 refresh REAUTH를 공유해도 이벤트는 한 번이다', (
      h,
      a,
    ) {
      for (final p in ['/a', '/b']) {
        h.adapter.on('GET', '$v1$p', [unauthorized()]);
      }
      h.adapter.on('POST', '$v1/auth/refresh', [
        reauth().withDelay(const Duration(seconds: 1)),
      ]);
      final rs = [get(h, '/a'), get(h, '/b')];
      advance(a, const Duration(seconds: 3));
      expect(rs.every((r) => errOf(r).isReauthenticationRequired), isTrue);
      expect(h.refreshCalls, 1);
      expect(h.clearedEvents, hasLength(1));
    }, session: sessionAt());
  });

  group('refresh 실패 처리', () {
    netTest(
      'TC-NET-023 refresh가 타임아웃이면 그 요청만 Network 오류로 실패하고 로그아웃·자동 재시도는 없다',
      (h, a) {
        h.adapter.on('GET', '$v1/a', [unauthorized()]);
        h.adapter.on('POST', '$v1/auth/refresh', [
          const FakeResponse.fault(FakeFault.timeout),
        ]);
        final r = get(h, '/a');
        advance(a, const Duration(seconds: 60));
        expect(errOf(r).isNetwork, isTrue);
        expect(h.refreshCalls, 1);
        expect(h.store.current?.refreshToken, 'rt1');
        expect(h.clearedEvents, isEmpty);
      },
      session: sessionAt(),
    );

    netTest('TC-NET-024 refresh가 5xx면 일시 실패로 보고 세션을 유지하며 refresh를 재시도하지 않는다', (
      h,
      a,
    ) {
      // fixture: auth/refresh__internal-error.json
      h.adapter.on('GET', '$v1/a', [unauthorized()]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.json(500, internalBody),
      ]);
      final r = get(h, '/a');
      advance(a, const Duration(seconds: 60));
      expect(errOf(r).status, 500);
      expect(h.refreshCalls, 1);
      expect(h.store.current?.refreshToken, 'rt1');
      expect(h.clearedEvents, isEmpty);
      expect(reqs(h, '/a'), hasLength(1));
    }, session: sessionAt());

    netTest(
      'TC-NET-025 refresh 응답에 필수 토큰 필드가 없으면 InvalidResponse로 실패하고 기존 세션을 덮어쓰지 않는다',
      (h, a) {
        // fixture: auth/refresh__missing-token-field.json
        h.adapter.on('GET', '$v1/a', [unauthorized()]);
        h.adapter.on('POST', '$v1/auth/refresh', [
          FakeResponse.json(200, {'accessToken': 'at2', 'expiresIn': 900}),
        ]);
        final r = get(h, '/a');
        advance(a, const Duration(seconds: 5));
        expect(errOf(r).isInvalidResponse, isTrue);
        expect(h.store.writes, isEmpty);
        expect(h.store.current?.accessToken, 'at1');
        expect(h.clearedEvents, isEmpty);
      },
      session: sessionAt(),
    );

    netTest('TC-NET-026 refresh가 400이면 요청만 실패시키고 로그아웃하지 않는다', (h, a) {
      h.adapter.on('GET', '$v1/a', [unauthorized()]);
      h.adapter.on('POST', '$v1/auth/refresh', [
        FakeResponse.json(400, businessBody),
      ]);
      final r = get(h, '/a');
      advance(a, const Duration(seconds: 5));
      expect(errOf(r).status, 400);
      expect(h.refreshCalls, 1);
      expect(h.store.current?.refreshToken, 'rt1');
      expect(h.clearedEvents, isEmpty);
    }, session: sessionAt());
  });

  group('갱신 도중 상태 변화', () {
    netTest('TC-NET-027 갱신 도중 로그아웃하면 새 토큰을 저장하지 않고 원 요청도 재전송하지 않는다', (h, a) {
      h.adapter.on('GET', '$v1/a', [unauthorized()]);
      scriptRefresh(h, delay: const Duration(seconds: 2));
      final r = get(h, '/a');
      advance(a, const Duration(seconds: 1));
      unawaited(h.sessions.clear(SessionClearReason.userLogout));
      advance(a, const Duration(seconds: 5));
      expect(h.store.current, isNull);
      expect(h.store.writes, isEmpty);
      expect(reqs(h, '/a'), hasLength(1));
      expect(r.error, isA<ApiError>());
      expect(h.clearedEvents, [SessionClearReason.userLogout]);
    }, session: sessionAt());

    netTest(
      'TC-NET-027 TC-NET-057 갱신 도중 계정이 바뀌면 이전 계정의 토큰을 저장하지 않고 재전송하지 않는다',
      (h, a) {
        h.adapter.on('GET', '$v1/a', [unauthorized()]);
        scriptRefresh(
          h,
          at: 'atA2',
          rt: 'rtA2',
          delay: const Duration(seconds: 2),
        );
        final r = get(h, '/a');
        advance(a, const Duration(seconds: 1));
        final b = sessionAt(userId: 'B', at: 'atB', rt: 'rtB');
        unawaited(h.sessions.save(b));
        advance(a, const Duration(seconds: 5));
        expect(h.store.current?.userId, 'B');
        expect(h.store.current?.refreshToken, 'rtB');
        expect(reqs(h, '/a'), hasLength(1));
        expect(r.error, isA<ApiError>());
      },
      session: sessionAt(userId: 'A', at: 'at1', rt: 'rt1'),
    );

    netTest(
      'TC-NET-057 계정이 바뀐 뒤 이전 계정 요청의 refresh가 REAUTH여도 새 계정 세션은 지우지 않는다',
      (h, a) {
        h.adapter.on('GET', '$v1/a', [unauthorized()]);
        h.adapter.on('POST', '$v1/auth/refresh', [
          reauth().withDelay(const Duration(seconds: 2)),
        ]);
        get(h, '/a');
        advance(a, const Duration(seconds: 1));
        unawaited(
          h.sessions.save(sessionAt(userId: 'B', at: 'atB', rt: 'rtB')),
        );
        advance(a, const Duration(seconds: 5));
        expect(h.store.current?.userId, 'B');
        expect(h.clearedEvents, isEmpty);
      },
      session: sessionAt(userId: 'A'),
    );

    netTest('TC-NET-028 refresh 중 한 요청이 취소돼도 refresh는 계속되고 대기 중인 다른 요청은 성공한다', (
      h,
      a,
    ) {
      expireAt1(h, '/a');
      expireAt1(h, '/b');
      scriptRefresh(h, delay: const Duration(seconds: 2));
      final tokenA = CancelToken();
      final ra = get(h, '/a', cancel: tokenA);
      final rb = get(h, '/b');
      advance(a, const Duration(seconds: 1));
      tokenA.cancel();
      advance(a, const Duration(seconds: 5));
      expect(errOf(ra).isCancelled, isTrue);
      expect(rb.succeeded, isTrue);
      expect(h.refreshCalls, 1);
      expect(reqs(h, '/a'), hasLength(1)); // 취소된 요청은 재전송하지 않는다
      expect(auth(reqs(h, '/b').last), 'Bearer at2');
      expect(h.store.current?.refreshToken, 'rt2');
    }, session: sessionAt());
  });

  group('갱신 대상 판정', () {
    netTest('TC-NET-013 세션이 없는 게스트 요청의 401은 갱신하지 않고 세션 지움 이벤트도 없다', (h, a) {
      h.adapter.on('GET', '$v1/posts', [unauthorized()]);
      final r = get(h, '/posts');
      settle(a);
      expect(errOf(r).isUnauthorized, isTrue);
      expect(h.refreshCalls, 0);
      expect(reqs(h, '/posts'), hasLength(1));
      expect(reqs(h, '/posts').single.hasAuthorization, isFalse);
      expect(h.clearedEvents, isEmpty);
    });

    netTest('TC-NET-013 게스트 플래그 세션도 갱신하지 않는다', (h, a) {
      h.adapter.on('GET', '$v1/posts', [unauthorized()]);
      final r = get(h, '/posts');
      settle(a);
      expect(errOf(r).isUnauthorized, isTrue);
      expect(h.refreshCalls, 0);
      expect(h.clearedEvents, isEmpty);
    }, session: sessionGuest());

    netTest('REQ-NET-018 요청 시점에 refresh token이 이미 만료였으면 갱신하지 않는다', (h, a) {
      h.adapter.on('GET', '$v1/a', [unauthorized()]);
      final r = get(h, '/a');
      settle(a);
      expect(errOf(r).isUnauthorized, isTrue);
      expect(h.refreshCalls, 0);
    }, session: sessionAt(refreshLeft: const Duration(seconds: -1)));

    netTest('TC-NET-031 GET /banners는 Authorization을 붙이지 않고 401이어도 갱신하지 않는다', (
      h,
      a,
    ) {
      h.adapter.on('GET', '$v1/banners', [unauthorized()]);
      final r = get(h, '/banners');
      settle(a);
      expect(errOf(r).isUnauthorized, isTrue);
      expect(reqs(h, '/banners').single.hasAuthorization, isFalse);
      expect(h.refreshCalls, 0);
      expect(h.store.current?.refreshToken, 'rt1');
    }, session: sessionAt());

    netTest(
      'TC-NET-017 POST /auth/logout, /auth/refresh 요청에는 Authorization이 없고 logout 401은 갱신하지 않는다',
      (h, a) {
        h.adapter.on('POST', '$v1/auth/logout', [unauthorized()]);
        final r = Probe<Object?>(
          h.client.requestNoContent(
            const ApiRequest(
              HttpMethod.post,
              '/auth/logout',
              body: {'refreshToken': 'rt1'},
            ),
          ),
        );
        settle(a);
        expect(r.error, isA<ApiError>());
        expect(h.adapter.requests.single.hasAuthorization, isFalse);
        expect(h.refreshCalls, 0);
      },
      session: sessionAt(),
    );

    netTest('TC-NET-032 403 FORBIDDEN은 재전송하지 않고 정지 상태를 로컬에 캐시하지 않는다', (h, a) {
      // fixture: common/error__forbidden-banned.json
      h.adapter.on('GET', '$v1/posts/today', [
        FakeResponse.json(403, {
          'errorCode': 'FORBIDDEN',
          'message': '차단된 회원입니다.',
        }),
        ok(),
      ]);
      final r1 = get(h, '/posts/today');
      advance(a, const Duration(seconds: 10));
      expect(errOf(r1).errorCode, ApiErrorCode.forbidden);
      expect(reqs(h, '/posts/today'), hasLength(1));
      // 다음 호출은 로컬 차단 없이 다시 서버로 나간다.
      final r2 = get(h, '/posts/today');
      advance(a, const Duration(seconds: 1));
      expect(reqs(h, '/posts/today'), hasLength(2));
      expect(r2.succeeded, isTrue);
      expect(h.clearedEvents, isEmpty);
    }, session: sessionAt());

    netTest('TC-TIME-028 기기 시계가 빨라 만료로 오판해도 401 → refresh로 복구된다', (h, a) {
      expireAt1(h, '/a');
      scriptRefresh(h);
      final r = get(h, '/a');
      settle(a);
      expect(r.succeeded, isTrue);
      expect(reqs(h, '/a').first.hasAuthorization, isFalse);
    }, session: sessionAt(accessLeft: const Duration(days: -1)));
  });
}
