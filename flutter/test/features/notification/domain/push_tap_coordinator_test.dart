import 'package:chalkak/core/auth/session.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/features/notification/domain/pending_push_store.dart';
import 'package:chalkak/features/notification/domain/push_tap_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/fakes.dart';
import '../../../support/net_harness.dart' show settle;
import '../../../support/notification_fakes.dart';

Session _member([String userId = myUserId]) =>
    sessionWithJwt(jwtFx('jwt__with-session-id'), userId: userId);

class _Rig {
  _Rig({Session? session, FakePendingPushStore? store, bool ready = true})
    : tokenStore = FakeTokenStore(session ?? _member()),
      store = store ?? FakePendingPushStore() {
    sessions = SessionManager(store: tokenStore);
    coordinator = _make();
    if (ready) coordinator.setMainReady(true);
  }

  final FakeTokenStore tokenStore;
  final FakePendingPushStore store;
  final TapRig tap = TapRig();
  late final SessionManager sessions;
  late PushTapCoordinator coordinator;

  PushTapCoordinator _make() => PushTapCoordinator(
    sessions: sessions,
    store: store,
    runner: tap.runner,
    navigator: tap.nav,
  );

  /// 프로세스 재시작을 흉내 낸다: 같은 저장소로 새 조정자를 만든다.
  PushTapCoordinator restart() => coordinator = _make();

  List<String> get nav => tap.nav.calls;
}

void main() {
  group('목적지 처리', () {
    fakeTest('TC-PUSH-037 TOPIC 탭은 홈 맨 위 + 새로고침이고 읽음 호출이 없다', (async) {
      final r = _Rig();
      resolve(async, r.coordinator.onTapped(pushPayloadFx('payload__topic')));
      expect(r.nav, ['home:top']);
      expect(r.tap.repo.readCalls, isEmpty);
    });

    fakeTest('TC-PUSH-039 TC-PUSH-053 POST_APPROVED 탭은 읽음 성공 후 게시물 상세로 이동한다', (
      async,
    ) {
      final r = _Rig();
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      expect(r.tap.repo.readCalls, [notiId(1)]);
      expect(r.nav, ['feed:$myPostId']);
    });

    fakeTest(
      'TC-PUSH-044 TC-PUSH-045 TC-PUSH-046 알 수 없는 type·type 누락·UUID 아님은 알림함으로 가고 읽음 호출이 없다',
      (async) {
        for (final fx in [
          'payload__unknown-type',
          'payload__missing-type',
          'payload__invalid-uuid',
        ]) {
          final r = _Rig();
          resolve(async, r.coordinator.onTapped(pushPayloadFx(fx)));
          expect(r.nav, ['inbox'], reason: fx);
          expect(r.tap.repo.readCalls, isEmpty, reason: fx);
        }
      },
    );

    fakeTest('TC-PUSH-048 대문자 UUID payload의 읽음 요청에는 소문자 id를 쓴다', (async) {
      final r = _Rig();
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__uppercase-uuid')),
      );
      expect(r.tap.repo.readCalls, ['33333333-3333-4333-8333-3333333333ab']);
    });

    fakeTest('TC-PUSH-052 같은 eventId의 탭이 두 번이면 중복 제거하지 않고 각각 처리한다', (async) {
      final r = _Rig();
      final payload = pushPayloadFx('payload__post-approved');
      resolve(async, r.coordinator.onTapped(payload));
      resolve(async, r.coordinator.onTapped(payload));
      expect(r.tap.repo.readCalls, hasLength(2));
      expect(r.nav, hasLength(2));
    });

    fakeTest('TC-PUSH-073 서버 설정이 꺼진 유형의 푸시도 payload 규칙대로 처리한다(로컬 필터 없음)', (
      async,
    ) {
      final r = _Rig();
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-rejected')),
      );
      expect(r.nav, ['detail:${notiId(2)}']);
    });

    fakeTest('TC-PUSH-055 읽음이 404면 토스트·새로고침만 하고 이동하지 않으며 보류분이 남지 않는다', (async) {
      final r = _Rig();
      r.tap.repo.onRead(notiId(1), [Reply.fail(errorFx(read404Fx))]);
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      expect(r.nav, isEmpty);
      expect(r.tap.inboxRefreshes, 1);
      expect(r.coordinator.hasPending, isFalse);
      expect(r.store.saved, isNull);
    });

    fakeTest('TC-PUSH-057 읽음이 401 REAUTH면 로그인 화면으로 가고 대기 이동을 폐기한다', (async) {
      final r = _Rig();
      r.tap.repo.onRead(notiId(1), [
        Reply.fail(errorFx('auth/refresh__reauthentication-required.json')),
      ]);
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      expect(r.nav, ['login']);
      expect(r.coordinator.hasPending, isFalse);
      expect(r.store.saved, isNull);
    });
  });

  group('로그아웃·게스트', () {
    fakeTest('TC-PUSH-058 세션이 없으면 앱만 열리고 대기 저장도 없으며 이후 로그인해도 이동하지 않는다', (
      async,
    ) {
      final r = _Rig(ready: false);
      resolve(async, r.tokenStore.clear());
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      expect(r.coordinator.hasPending, isFalse);
      expect(r.store.writes, 0);
      r.tokenStore.current = _member();
      r.coordinator.setMainReady(true);
      resolve(async, r.coordinator.flush());
      expect(r.nav, isEmpty);
      expect(r.tap.repo.readCalls, isEmpty);
    });

    fakeTest('TC-PUSH-059 게스트 탭은 버리고 앱만 열린다', (async) {
      final r = _Rig(session: Session.guest());
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      expect(r.nav, isEmpty);
      expect(r.store.writes, 0);
      expect(r.coordinator.hasPending, isFalse);
    });
  });

  group('보류', () {
    fakeTest('TC-PUSH-060 가입 화면(사인 미리보기)이 막고 있으면 보류했다가 풀리면 한 번 처리한다', (async) {
      final r = _Rig();
      r.coordinator.setBlocked('signature-preview', blocked: true);
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      expect(r.nav, isEmpty);
      expect(r.coordinator.hasPending, isTrue);
      r.coordinator.setBlocked('signature-preview', blocked: false);
      settle(async);
      expect(r.nav, ['feed:$myPostId']);
      expect(r.coordinator.hasPending, isFalse);
    });

    fakeTest('TC-PUSH-061 업로드·피드백 작성 중이면 차단하고 모든 막는 화면이 풀린 뒤에 처리한다', (async) {
      final r = _Rig();
      r.coordinator.setBlocked('upload', blocked: true);
      r.coordinator.setBlocked('feedback', blocked: true);
      resolve(async, r.coordinator.onTapped(pushPayloadFx('payload__topic')));
      r.coordinator.setBlocked('upload', blocked: false);
      settle(async);
      expect(r.nav, isEmpty, reason: '피드백 작성이 아직 막고 있다');
      r.coordinator.setBlocked('feedback', blocked: false);
      settle(async);
      expect(r.nav, ['home:top']);
    });

    fakeTest(
      'TC-BOOT-035 TC-PUSH-062 콜드 스타트 탭은 메인이 준비될 때까지 버퍼링했다가 정확히 1회만 소비한다',
      (async) {
        final r = _Rig(ready: false);
        resolve(async, r.coordinator.onTapped(pushPayloadFx('payload__topic')));
        expect(r.nav, isEmpty);
        r.coordinator.setMainReady(true);
        settle(async);
        expect(r.nav, ['home:top']);
        r.coordinator.setMainReady(false);
        r.coordinator.setMainReady(true);
        resolve(async, r.coordinator.flush());
        expect(r.nav, ['home:top'], reason: '다시 소비하지 않는다');
      },
    );

    fakeTest('TC-PUSH-063 보류 중인 탭은 프로세스 종료 뒤에도 복원되고 소비 뒤에는 저장되지 않는다', (async) {
      final r = _Rig(ready: false);
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      expect(r.store.saved, isNotNull);
      expect(r.store.saved!.userId, myUserId);
      final restarted = r.restart();
      resolve(async, restarted.restore());
      expect(restarted.hasPending, isTrue);
      restarted.setMainReady(true);
      settle(async);
      expect(r.nav, ['feed:$myPostId']);
      expect(r.store.saved, isNull);
      final again = r.restart();
      resolve(async, again.restore());
      expect(again.hasPending, isFalse);
    });

    fakeTest('TC-PUSH-063 새 푸시 탭은 이전 보류분을 교체한다', (async) {
      final r = _Rig(ready: false);
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      resolve(async, r.coordinator.onTapped(pushPayloadFx('payload__topic')));
      expect(r.store.saved!.payload.type, 'TOPIC');
      r.coordinator.setMainReady(true);
      settle(async);
      expect(r.nav, ['home:top'], reason: '이전 보류분은 처리하지 않는다');
      expect(r.tap.repo.readCalls, isEmpty);
    });

    fakeTest('TC-PUSH-066 푸시 탭 뒤 로그인 계정이 바뀌면 대기 중인 이동을 폐기한다', (async) {
      final r = _Rig(ready: false);
      resolve(
        async,
        r.coordinator.onTapped(pushPayloadFx('payload__post-approved')),
      );
      r.tokenStore.current = _member(otherUserId);
      r.coordinator.setMainReady(true);
      settle(async);
      expect(r.nav, isEmpty);
      expect(r.tap.repo.readCalls, isEmpty);
      expect(r.store.saved, isNull);
    });

    fakeTest('TC-PUSH-066 로그아웃·계정 전환(clearAll)은 메모리와 저장소의 보류분을 지운다', (async) {
      final r = _Rig(ready: false);
      resolve(async, r.coordinator.onTapped(pushPayloadFx('payload__topic')));
      resolve(async, r.coordinator.clearAll());
      expect(r.coordinator.hasPending, isFalse);
      expect(r.store.saved, isNull);
      r.coordinator.setMainReady(true);
      settle(async);
      expect(r.nav, isEmpty);
    });
  });

  test('PendingPush는 payload와 탭한 계정을 함께 가진다', () {
    final p = PendingPush(
      payload: payloadOf(type: 'TOPIC'),
      userId: myUserId,
    );
    expect(p.userId, myUserId);
    expect(p.payload.type, 'TOPIC');
  });
}
