import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/notification/domain/notification_route.dart';
import 'package:chalkak/features/notification/domain/notification_tap_runner.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show settle;
import '../../../support/notification_fakes.dart';

NavigatePlan _approved() => NavigatePlan(
  const FeedDestination(postId: myPostId, openAiFeedback: false),
  readNotificationId: notiId(1),
);

NavigatePlan _ai() => NavigatePlan(
  const FeedDestination(postId: myPostId, openAiFeedback: true),
  readNotificationId: notiId(3),
);

NavigatePlan _detail(int nn) => NavigatePlan(
  NotificationDetailDestination(notiId(nn)),
  readNotificationId: notiId(nn),
);

void main() {
  group('읽음 성공', () {
    fakeTest(
      'TC-NOTI-027 TC-PUSH-039 TC-PUSH-053 읽음 PATCH가 끝난 뒤에야 게시물 상세로 이동한다',
      (async) {
        final r = TapRig();
        final gate = Completer<void>();
        r.repo.onRead(notiId(1), [Reply.ok(null, gate: gate.future)]);
        final p = start(async, r.runner.run(_approved()));
        expect(r.repo.readCalls, [notiId(1)]);
        expect(r.nav.calls, isEmpty, reason: '읽음 응답 전에는 이동하지 않는다');
        gate.complete();
        settle(async);
        expect(p.value, TapResult.navigated);
        expect(r.nav.calls, ['feed:$myPostId']);
        expect(r.nav.feedTargets.single.isMine, isTrue);
      },
    );

    fakeTest('TC-NOTI-028 AI 리뷰 알림은 읽음 후 게시물 상세와 AI 시트 자동 열기', (async) {
      final r = TapRig();
      expect(resolve(async, r.runner.run(_ai())), TapResult.navigated);
      expect(r.repo.readCalls, [notiId(3)]);
      expect(r.nav.calls, ['feed:$myPostId:ai']);
    });

    fakeTest(
      'TC-NOTI-030 TC-NOTI-031 TC-PUSH-041 TC-PUSH-042 NOTICE·POST_REJECTED는 읽음 후 알림 상세',
      (async) {
        final r = TapRig();
        resolve(async, r.runner.run(_detail(5)));
        resolve(async, r.runner.run(_detail(2)));
        expect(r.repo.readCalls, [notiId(5), notiId(2)]);
        expect(r.nav.calls, ['detail:${notiId(5)}', 'detail:${notiId(2)}']);
      },
    );

    fakeTest('REQ-NOTI-029 읽음 성공 뒤 미읽음 상태를 다시 조회한다', (async) {
      final r = TapRig();
      resolve(async, r.runner.run(_approved()));
      expect(r.unread.calls, 1);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest(
      'TC-PUSH-037 TC-PUSH-038 읽음이 필요 없는 계획(TOPIC·REMINDER·알림함)은 읽음 요청 없이 바로 이동한다',
      (async) {
        final r = TapRig();
        resolve(
          async,
          r.runner.run(
            const NavigatePlan(HomeDestination(scrollToTopAndRefresh: true)),
          ),
        );
        resolve(
          async,
          r.runner.run(
            const NavigatePlan(HomeDestination(scrollToTopAndRefresh: false)),
          ),
        );
        resolve(async, r.runner.run(const NavigatePlan(InboxDestination())));
        expect(r.repo.readCalls, isEmpty);
        expect(r.nav.calls, ['home:top', 'home', 'inbox']);
      },
    );
  });

  group('읽음 실패', () {
    fakeTest('TC-NOTI-032 TC-PUSH-054 네트워크 오류면 토스트 후 이동은 수행한다', (async) {
      final r = TapRig();
      r.repo.onRead(notiId(1), [Reply.fail(networkError())]);
      final result = resolve(async, r.runner.run(_approved()));
      expect(result, TapResult.navigatedReadFailed);
      expect(r.toast.messages, [Copy.notiReadErrorNetwork]);
      expect(r.nav.calls, ['feed:$myPostId']);
      expect(r.inboxRefreshes, 0);
    });

    fakeTest('TC-NOTI-033 TC-PUSH-055 404면 토스트 notiGone, 목록·미읽음 새로고침, 이동 안 함', (
      async,
    ) {
      final r = TapRig();
      r.repo.onRead(notiId(1), [Reply.fail(errorFx(read404Fx))]);
      final result = resolve(async, r.runner.run(_approved()));
      expect(result, TapResult.gone);
      expect(r.toast.messages, [Copy.notiGone]);
      expect(r.nav.calls, isEmpty);
      expect(r.inboxRefreshes, 1);
      expect(r.unread.calls, 1);
    });

    fakeTest('TC-NOTI-034 TC-PUSH-056 500·403·400도 404와 같게 처리하고 이동하지 않는다', (
      async,
    ) {
      for (final error in [
        errorFx(read500Fx),
        errorFx('common/error__forbidden-no-permission.json'),
        errorFx('common/error__business-400.json'),
      ]) {
        final r = TapRig();
        r.repo.onRead(notiId(1), [Reply.fail(error)]);
        expect(resolve(async, r.runner.run(_approved())), TapResult.gone);
        expect(r.toast.messages, [Copy.notiGone], reason: '$error');
        expect(r.nav.calls, isEmpty);
        expect(r.inboxRefreshes, 1);
        expect(r.unread.calls, 1);
      }
    });

    fakeTest('TC-NOTI-035 TC-PUSH-057 401 UNAUTHORIZED면 로그인 화면으로 가고 이동하지 않는다', (
      async,
    ) {
      final r = TapRig();
      r.repo.onRead(notiId(1), [Reply.fail(errorFx(read401Fx))]);
      expect(
        resolve(async, r.runner.run(_approved())),
        TapResult.loginRequired,
      );
      expect(r.nav.calls, ['login']);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest(
      'TC-NOTI-035 TC-PUSH-057 401 REAUTHENTICATION_REQUIRED도 로그인 화면이다',
      (async) {
        final r = TapRig();
        r.repo.onRead(notiId(1), [
          Reply.fail(errorFx('auth/refresh__reauthentication-required.json')),
        ]);
        expect(
          resolve(async, r.runner.run(_approved())),
          TapResult.loginRequired,
        );
        expect(r.nav.calls, ['login']);
      },
    );
  });

  group('취소와 계정 전환', () {
    fakeTest('TC-NOTI-039 읽음 PATCH 중 화면을 떠나면(취소) 이동도 오류 토스트도 없다', (async) {
      final r = TapRig();
      final gate = Completer<void>();
      final token = CancelToken();
      r.repo.onRead(notiId(1), [Reply.ok(null, gate: gate.future)]);
      final p = start(async, r.runner.run(_approved(), cancelToken: token));
      token.cancel();
      gate.complete();
      settle(async);
      expect(p.value, TapResult.cancelled);
      expect(r.nav.calls, isEmpty);
      expect(r.toast.messages, isEmpty);
      expect(r.unread.calls, 0);
    });

    fakeTest('TC-NOTI-040 읽음 PATCH 중 로그아웃·계정 전환이면 응답이 와도 이동하지 않는다', (async) {
      final r = TapRig();
      final gate = Completer<void>();
      r.repo.onRead(notiId(1), [Reply.ok(null, gate: gate.future)]);
      final p = start(async, r.runner.run(_approved()));
      resolve(async, r.runner.clearAll());
      gate.complete();
      settle(async);
      expect(p.value, TapResult.cancelled);
      expect(r.nav.calls, isEmpty);
      expect(r.toast.messages, isEmpty);
      expect(r.unread.calls, 0, reason: '이전 계정의 미읽음 조회로 새 계정 점을 바꾸지 않는다');
      expect(r.inboxRefreshes, 0);
    });

    fakeTest('TC-NOTI-040 계정 전환 뒤의 새 탭은 정상 처리한다', (async) {
      final r = TapRig();
      resolve(async, r.runner.clearAll());
      expect(resolve(async, r.runner.run(_approved())), TapResult.navigated);
      expect(r.nav.calls, ['feed:$myPostId']);
    });
  });
}
