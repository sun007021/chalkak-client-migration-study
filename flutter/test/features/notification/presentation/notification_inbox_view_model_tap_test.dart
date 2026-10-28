import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show settle;
import '../../../support/notification_fakes.dart';

InboxRig _loaded(FakeAsync async, [String fixture = pageFx1]) {
  final r = InboxRig();
  r.repo.servePage(1, fixture);
  resolve(async, r.vm.start());
  return r;
}

void main() {
  group('이동 없는 행', () {
    fakeTest('TC-NOTI-024 알 수 없는 type 행을 탭하면 알림함에 머물고 읽음 호출도 없다', (async) {
      final r = _loaded(async, pageFxUnknownType);
      resolve(async, r.vm.onItemTapped(notiId(1)));
      expect(r.nav.calls, isEmpty);
      expect(r.repo.readCalls, isEmpty);
      expect(r.toast.messages, isEmpty);
      expect(r.item(notiId(1)).isUnread, isTrue);
    });

    fakeTest(
      'TC-NOTI-026 sourceType·sourceId가 null인 POST_APPROVED는 이동·읽음·오류 모두 없다',
      (async) {
        final r = _loaded(async, pageFxNullSource);
        resolve(async, r.vm.onItemTapped(notiId(1)));
        expect(r.nav.calls, isEmpty);
        expect(r.repo.readCalls, isEmpty);
        expect(r.toast.messages, isEmpty);
      },
    );

    fakeTest(
      'TC-NOTI-029 AI 알림의 sourceType이 POST가 아니거나 sourceId가 UUID가 아니면 피드로 가지 않는다',
      (async) {
        final r = _loaded(async, pageFxBadAiSource);
        resolve(async, r.vm.onItemTapped(notiId(3)));
        resolve(async, r.vm.onItemTapped(notiId(8)));
        expect(r.nav.calls, isEmpty);
        expect(r.repo.readCalls, isEmpty);
      },
    );

    fakeTest('TC-NOTI-025 TOPIC은 홈(맨 위)으로, REMINDER는 홈으로 가고 읽음 호출은 없다', (
      async,
    ) {
      final r = _loaded(async, pageFxTopicReminder);
      resolve(async, r.vm.onItemTapped(notiId(31)));
      resolve(async, r.vm.onItemTapped(notiId(32)));
      expect(r.nav.calls, ['home:top', 'home']);
      expect(r.repo.readCalls, isEmpty);
    });

    fakeTest('존재하지 않는 id를 탭해도 아무 일이 없다', (async) {
      final r = _loaded(async);
      resolve(async, r.vm.onItemTapped(notiId(99)));
      expect(r.nav.calls, isEmpty);
      expect(r.repo.readCalls, isEmpty);
    });
  });

  group('읽음 후 이동', () {
    fakeTest('TC-NOTI-027 POST_APPROVED 행은 읽음 성공 후 게시물 상세(내 게시물)로 이동한다', (
      async,
    ) {
      final r = _loaded(async);
      resolve(async, r.vm.onItemTapped(notiId(1)));
      expect(r.repo.readCalls, [notiId(1)]);
      expect(r.nav.calls, ['feed:$myPostId']);
    });

    fakeTest('TC-NOTI-028 AI 알림 행은 읽음 후 게시물 상세 + AI 시트 자동 열기', (async) {
      final r = _loaded(async);
      resolve(async, r.vm.onItemTapped(notiId(3)));
      resolve(async, r.vm.onItemTapped(notiId(4)));
      expect(r.nav.calls, ['feed:$myPostId:ai', 'feed:$myPostId:ai']);
    });

    fakeTest(
      'TC-NOTI-030 TC-NOTI-031 NOTICE·POST_REJECTED 행은 읽음 후 notificationId로 알림 상세',
      (async) {
        final r = _loaded(async);
        resolve(async, r.vm.onItemTapped(notiId(5)));
        resolve(async, r.vm.onItemTapped(notiId(2)));
        expect(r.nav.calls, ['detail:${notiId(5)}', 'detail:${notiId(2)}']);
      },
    );

    fakeTest('TC-NOTI-036 읽음 성공이면 그 행만 읽음으로 바뀌고 미읽음 표시가 사라진다', (async) {
      final r = _loaded(async);
      expect(r.item(notiId(1)).isUnread, isTrue);
      resolve(async, r.vm.onItemTapped(notiId(1)));
      expect(r.item(notiId(1)).isUnread, isFalse);
      expect(r.item(notiId(2)).isUnread, isTrue, reason: '다른 행은 그대로');
      expect(r.unread.calls, 1);
    });

    fakeTest(
      'TC-NOTI-037 이미 읽은 항목을 다시 탭하면 최초 readAt을 유지하고 PATCH 204는 성공으로 처리한다',
      (async) {
        final r = _loaded(async);
        final original = r.item(notiId(6)).readAt;
        expect(original, isNotNull);
        resolve(async, r.vm.onItemTapped(notiId(6)));
        expect(r.item(notiId(6)).readAt, original);
        expect(r.repo.readCalls, [notiId(6)], reason: '임시 규칙: 항상 보낸다(확인 필요 3)');
        expect(r.nav.calls, hasLength(1));
        expect(r.toast.messages, isEmpty);
      },
    );

    test('TC-NOTI-037 markRead는 이미 읽은 항목의 readAt을 바꾸지 않는다', () {
      final read = makeItem(readAt: DateTime.utc(2026, 10, 26, 1));
      expect(
        read.markRead(DateTime.utc(2026, 10, 27)).readAt,
        DateTime.utc(2026, 10, 26, 1),
      );
      final unread = makeItem();
      expect(
        unread.markRead(DateTime.utc(2026, 10, 27)).readAt,
        DateTime.utc(2026, 10, 27),
      );
    });

    fakeTest('TC-NOTI-038 같은 행을 빠르게 연타해도 읽음 PATCH 1회, 이동 1회', (async) {
      final r = _loaded(async);
      final gate = Completer<void>();
      r.repo.onRead(notiId(1), [Reply.ok(null, gate: gate.future)]);
      r.vm.onItemTapped(notiId(1));
      r.vm.onItemTapped(notiId(1));
      r.vm.onItemTapped(notiId(1));
      settle(async);
      expect(r.state.processingIds, {notiId(1)});
      gate.complete();
      settle(async);
      r.vm.onItemTapped(notiId(1));
      settle(async);
      expect(r.state.processingIds, isEmpty);
      expect(
        r.repo.readCalls.length,
        2,
        reason: '처리가 끝난 뒤의 새 탭은 다시 처리한다. 진행 중 연타 3회는 1회',
      );
      expect(r.nav.calls, hasLength(2));
    });

    fakeTest('TC-NOTI-038 처리 중에 다른 행은 탭할 수 있다', (async) {
      final r = _loaded(async);
      final gate = Completer<void>();
      r.repo.onRead(notiId(1), [Reply.ok(null, gate: gate.future)]);
      r.vm.onItemTapped(notiId(1));
      resolve(async, r.vm.onItemTapped(notiId(2)));
      expect(r.repo.readCalls, [notiId(1), notiId(2)]);
      expect(r.nav.calls, ['detail:${notiId(2)}']);
    });
  });

  group('읽음 실패', () {
    fakeTest('TC-NOTI-032 읽음이 네트워크 오류면 토스트 후 이동하고 목록의 미읽음 상태는 그대로다', (async) {
      final r = _loaded(async);
      r.repo.onRead(notiId(1), [Reply.fail(networkError())]);
      resolve(async, r.vm.onItemTapped(notiId(1)));
      expect(r.toast.messages, [Copy.notiReadErrorNetwork]);
      expect(r.nav.calls, ['feed:$myPostId']);
      expect(r.item(notiId(1)).isUnread, isTrue);
    });

    fakeTest('TC-NOTI-033 읽음 404면 토스트, 목록과 미읽음 새로고침, 이동 안 함', (async) {
      final r = _loaded(async);
      r.repo.onRead(notiId(1), [Reply.fail(errorFx(read404Fx))]);
      final pagesBefore = r.repo.pageCalls.length;
      resolve(async, r.vm.onItemTapped(notiId(1)));
      expect(r.toast.messages, [Copy.notiGone]);
      expect(r.nav.calls, isEmpty);
      expect(
        r.repo.pageCalls.length,
        pagesBefore + 1,
        reason: '목록 첫 페이지를 다시 불러온다',
      );
      expect(r.unread.calls, 1);
    });

    fakeTest('TC-NOTI-034 읽음이 500이어도 404와 같게 처리하고 이동하지 않는다', (async) {
      final r = _loaded(async);
      r.repo.onRead(notiId(1), [Reply.fail(errorFx(read500Fx))]);
      resolve(async, r.vm.onItemTapped(notiId(1)));
      expect(r.toast.messages, [Copy.notiGone]);
      expect(r.nav.calls, isEmpty);
      expect(r.item(notiId(1)).isUnread, isTrue);
    });

    fakeTest('TC-NOTI-035 읽음 401이면 로그인 화면으로 가고 이동하지 않는다', (async) {
      final r = _loaded(async);
      r.repo.onRead(notiId(1), [Reply.fail(errorFx(read401Fx))]);
      resolve(async, r.vm.onItemTapped(notiId(1)));
      expect(r.nav.calls, ['login']);
    });

    fakeTest('TC-NOTI-039 읽음 PATCH 중 화면을 떠나면 응답이 와도 이동하지 않고 오류도 없다', (async) {
      final r = _loaded(async);
      final gate = Completer<void>();
      r.repo.onRead(notiId(1), [Reply.ok(null, gate: gate.future)]);
      r.vm.onItemTapped(notiId(1));
      settle(async);
      r.vm.dispose();
      gate.complete();
      settle(async);
      expect(r.nav.calls, isEmpty);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-NOTI-040 읽음 PATCH 중 로그아웃·계정 전환이면 이전 계정 목록에 반영하지도 이동하지도 않는다', (
      async,
    ) {
      final r = _loaded(async);
      final gate = Completer<void>();
      r.repo.onRead(notiId(1), [Reply.ok(null, gate: gate.future)]);
      r.vm.onItemTapped(notiId(1));
      settle(async);
      resolve(async, r.runner.clearAll());
      gate.complete();
      settle(async);
      expect(r.nav.calls, isEmpty);
      expect(r.item(notiId(1)).isUnread, isTrue);
      expect(r.state.processingIds, isEmpty);
    });
  });
}
