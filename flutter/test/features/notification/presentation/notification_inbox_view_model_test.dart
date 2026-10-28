import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/network/api_error.dart';
import 'package:chalkak/features/notification/presentation/notification_inbox_view_model.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;
import '../../../support/notification_fakes.dart';

InboxRig _rig({bool second = true}) {
  final r = InboxRig();
  r.repo.servePage(1, pageFx1);
  if (second) r.repo.servePage(2, pageFx2Last);
  return r;
}

void _start(FakeAsync async, InboxRig r) => resolve(async, r.vm.start());

void _scrollEnd(FakeAsync async, InboxRig r) {
  r.vm.onVisibleIndexChanged(r.state.items.length - 1);
  settle(async);
}

void main() {
  group('첫 로딩', () {
    fakeTest(
      'REQ-NOTI-001 TC-NOTI-002 진입하면 page=1, pageSize=20을 요청하고 응답 순서대로 보여 준다',
      (async) {
        final r = _rig();
        final p = start(async, r.vm.start());
        expect(r.state.status, InboxStatus.loading);
        expect(p.done, isTrue);
        expect(r.repo.pageCalls, [(page: 1, pageSize: 20)]);
        expect(r.state.status, InboxStatus.content);
        expect(r.ids, notiIdsOf(pageFx1));
        expect(r.state.hasNext, isTrue);
      },
    );

    fakeTest('REQ-NOTI-014 알림함이 보이면 screen_view notifications를 1회 보낸다', (
      async,
    ) {
      final r = _rig();
      _start(async, r);
      expect(r.analytics.screenNames, ['notifications']);
    });

    fakeTest('TC-NOTI-004 첫 로딩 중에는 loading 상태다', (async) {
      final r = _rig();
      final gate = Completer<void>();
      r.repo.onPage(1, [Reply.ok(notiPageFx(pageFx1), gate: gate.future)]);
      start(async, r.vm.start());
      expect(r.state.status, InboxStatus.loading);
      expect(r.state.items, isEmpty);
      gate.complete();
      settle(async);
      expect(r.state.status, InboxStatus.content);
    });

    fakeTest('TC-NOTI-005 빈 응답이면 empty 상태다', (async) {
      final r = InboxRig();
      r.repo.servePage(1, pageFxEmpty);
      _start(async, r);
      expect(r.state.status, InboxStatus.empty);
      expect(r.state.items, isEmpty);
    });

    fakeTest('TC-NOTI-006 콘텐츠 없이 500이면 notiInboxError 오류 상태이고 다시 시도가 재요청한다', (
      async,
    ) {
      final r = InboxRig();
      r.repo.onPage(1, [
        Reply.fail(errorFx(pageFx500)),
        Reply.ok(notiPageFx(pageFx1)),
      ]);
      _start(async, r);
      expect(r.state.status, InboxStatus.error);
      expect(r.state.errorMessage, Copy.notiInboxError);
      resolve(async, r.vm.retry());
      expect(r.repo.pagesRequested, [1, 1]);
      expect(r.state.status, InboxStatus.content);
      expect(r.state.errorMessage, isNull);
    });

    fakeTest('TC-NOTI-007 네트워크 오류면 notiNetwork 문구', (async) {
      final r = InboxRig();
      r.repo.onPage(1, [Reply.fail(networkError())]);
      _start(async, r);
      expect(r.state.status, InboxStatus.error);
      expect(r.state.errorMessage, Copy.notiNetwork);
    });

    fakeTest(
      'TC-NOTI-008 계약 위반(필수 필드 누락·깨진 JSON)이면 notiInboxError이고 크래시하지 않는다',
      (async) {
        final r = InboxRig();
        r.repo.onPage(1, [Reply.fail(ApiError.invalidResponse())]);
        _start(async, r);
        expect(r.state.status, InboxStatus.error);
        expect(r.state.errorMessage, Copy.notiInboxError);
      },
    );

    fakeTest('TC-NOTI-009 401은 로그인 필요 이벤트를 내고 오류 문구는 없다', (async) {
      final r = InboxRig();
      r.repo.onPage(1, [Reply.fail(errorFx(pageFx401))]);
      _start(async, r);
      expect(r.events.whereType<InboxLoginRequired>(), hasLength(1));
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-NOTI-009 REAUTHENTICATION_REQUIRED도 로그인 필요 이벤트다', (async) {
      final r = InboxRig();
      r.repo.onPage(1, [
        Reply.fail(errorFx('auth/refresh__reauthentication-required.json')),
      ]);
      _start(async, r);
      expect(r.events.whereType<InboxLoginRequired>(), hasLength(1));
    });

    fakeTest('TC-NOTI-010 목록 404는 D-24 통일 문구 notiGone을 오류 화면에 보이고 다시 불러온다', (
      async,
    ) {
      final r = InboxRig();
      r.repo.onPage(1, [
        Reply.fail(errorFx(pageFx404)),
        Reply.ok(notiPageFx(pageFx1)),
      ]);
      _start(async, r);
      expect(r.state.status, InboxStatus.error);
      expect(r.state.errorMessage, Copy.notiGone);
      resolve(async, r.vm.retry());
      expect(r.state.status, InboxStatus.content);
    });
  });

  group('항목 표시', () {
    fakeTest('TC-NOTI-012 createdAt을 KST "M월 d일 HH:mm"로 표시한다(자정 경계, 소수 초 포함)', (
      async,
    ) {
      final r = InboxRig();
      r.repo.servePage(1, pageFxKst);
      _start(async, r);
      expect(
        [for (final i in r.state.items) i.timeLabel],
        ['10월 27일 00:00', '10월 26일 23:59', '10월 27일 00:00'],
      );
    });

    fakeTest('TC-NOTI-023 30일 경계 항목과 오래된 항목을 날짜로 거르지 않고 모두 보여 준다', (async) {
      final r = InboxRig();
      r.repo.servePage(1, pageFx30Day);
      _start(async, r);
      expect(r.ids, notiIdsOf(pageFx30Day));
      expect(r.state.items, hasLength(2));
    });

    fakeTest('TC-NOTI-024 알 수 없는 type 항목도 목록에 표시한다', (async) {
      final r = InboxRig();
      r.repo.servePage(1, pageFxUnknownType);
      _start(async, r);
      expect(r.state.items, hasLength(1));
      expect(r.state.status, InboxStatus.content);
    });
  });

  group('다음 페이지', () {
    fakeTest('TC-NOTI-015 끝에서 4번째 근처까지 스크롤하면 page=2를 1회만 요청한다', (async) {
      final r = _rig();
      _start(async, r);
      r.vm.onVisibleIndexChanged(14);
      settle(async);
      expect(r.repo.pagesRequested, [1], reason: '끝에서 4개 밖에서는 요청하지 않는다');
      final gate = Completer<void>();
      r.repo.onPage(2, [Reply.ok(notiPageFx(pageFx2Last), gate: gate.future)]);
      r.vm.onVisibleIndexChanged(16);
      r.vm.onVisibleIndexChanged(17);
      r.vm.onVisibleIndexChanged(19);
      settle(async);
      expect(r.repo.pagesRequested, [1, 2]);
      expect(r.state.isLoadingMore, isTrue);
      gate.complete();
      settle(async);
      expect(r.state.isLoadingMore, isFalse);
      expect(r.ids, [...notiIdsOf(pageFx1), ...notiIdsOf(pageFx2Last)]);
      _scrollEnd(async, r);
      expect(r.repo.pagesRequested, [1, 2], reason: '계속 스크롤해도 중복 요청이 없다');
    });

    fakeTest('TC-NOTI-016 hasNext=false면 끝까지 스크롤해도 추가 요청 0건', (async) {
      final r = InboxRig();
      r.repo.servePage(1, pageFx2Last);
      _start(async, r);
      expect(r.state.hasNext, isFalse);
      _scrollEnd(async, r);
      expect(r.repo.pagesRequested, [1]);
    });

    fakeTest('TC-NOTI-017 2페이지에 1페이지와 같은 id가 있으면 중복을 제거하고 순서를 유지한다', (async) {
      final r = _rig(second: false);
      r.repo.servePage(2, pageFxOverlap);
      _start(async, r);
      _scrollEnd(async, r);
      final expected = [
        ...notiIdsOf(pageFx1),
        notiId(26),
        notiId(27),
        notiId(28),
      ];
      expect(r.ids, expected);
      expect(r.ids.toSet(), hasLength(r.ids.length));
    });

    fakeTest(
      'TC-NOTI-018 다음 페이지가 실패하면 기존 목록·페이지를 유지하고 토스트, 다시 스크롤하면 같은 페이지를 재요청한다',
      (async) {
        final r = _rig(second: false);
        r.repo.onPage(2, [
          Reply.fail(errorFx(pageFx500)),
          Reply.ok(notiPageFx(pageFx2Last)),
        ]);
        _start(async, r);
        _scrollEnd(async, r);
        expect(r.state.status, InboxStatus.content);
        expect(r.ids, notiIdsOf(pageFx1));
        expect(r.toast.messages, [Copy.notiInboxMoreError]);
        expect(r.state.hasNext, isTrue);
        _scrollEnd(async, r);
        expect(r.repo.pagesRequested, [1, 2, 2], reason: '같은 페이지(2)를 다시 요청');
        expect(r.state.items, hasLength(25));
      },
    );
  });

  group('새로고침', () {
    fakeTest('TC-NOTI-019 당겨서 새로고침이 성공하면 목록이 교체되고 페이지가 1로 돌아간다', (async) {
      final r = _rig();
      _start(async, r);
      _scrollEnd(async, r);
      expect(r.state.items, hasLength(25));
      resolve(async, r.vm.refresh());
      expect(r.ids, notiIdsOf(pageFx1));
      expect(r.state.isRefreshing, isFalse);
      _scrollEnd(async, r);
      expect(r.repo.pagesRequested.last, 2, reason: '새로고침 뒤 다음 페이지는 다시 2다');
    });

    fakeTest(
      'TC-NOTI-020 새로고침 실패면 기존 목록을 유지하고 notiInboxRefreshError 토스트만 띄운다',
      (async) {
        final r = _rig();
        _start(async, r);
        r.repo.onPage(1, [Reply.fail(errorFx(pageFx500))]);
        resolve(async, r.vm.refresh());
        expect(r.state.status, InboxStatus.content);
        expect(r.ids, notiIdsOf(pageFx1));
        expect(r.toast.messages, [Copy.notiInboxRefreshError]);
        expect(r.state.isRefreshing, isFalse);
      },
    );

    fakeTest('TC-NOTI-021 새로고침 두 개가 겹치면 늦게 끝난 이전 응답은 버려지고 다음 페이지 기준은 최신 응답이다', (
      async,
    ) {
      final r = _rig();
      _start(async, r);
      r.repo.onPage(1, [
        Reply.ok(notiPageFx(pageFx2Last), delay: const Duration(seconds: 2)),
        Reply.ok(notiPageFx(pageFx1)),
      ]);
      r.vm.refresh();
      advance(async, const Duration(milliseconds: 100));
      r.vm.refresh();
      advance(async, const Duration(seconds: 3));
      expect(r.ids, notiIdsOf(pageFx1), reason: '먼저 보낸 느린 응답(5건)은 버려진다');
      expect(r.state.hasNext, isTrue);
      expect(r.state.isRefreshing, isFalse);
    });

    fakeTest('TC-NOTI-022 새로고침 요청이 취소되면 오류 토스트가 없고 목록은 그대로다', (async) {
      final r = _rig();
      _start(async, r);
      r.repo.onPage(1, [Reply.fail(ApiError.cancelled())]);
      resolve(async, r.vm.refresh());
      expect(r.toast.messages, isEmpty);
      expect(r.state.status, InboxStatus.content);
      expect(r.ids, notiIdsOf(pageFx1));
    });

    fakeTest('TC-NOTI-022 로드 중 화면을 떠나면(dispose) 응답이 도착해도 오류 토스트가 없다', (async) {
      final r = _rig();
      final gate = Completer<void>();
      r.repo.onPage(1, [Reply.ok(notiPageFx(pageFx1), gate: gate.future)]);
      start(async, r.vm.start());
      r.vm.dispose();
      gate.complete();
      settle(async);
      expect(r.toast.messages, isEmpty);
      expect(r.events, isEmpty);
    });

    fakeTest('REQ-NOTI-012 상세·피드에서 돌아오면 첫 페이지를 조용히 다시 불러온다', (async) {
      final r = _rig();
      _start(async, r);
      final read = notiPageFx(pageFx1);
      r.repo.onPage(1, [Reply.ok(read)]);
      resolve(async, r.vm.onResumed());
      expect(r.repo.pagesRequested, [1, 1]);
      expect(r.state.isRefreshing, isFalse, reason: '조용한 갱신은 새로고침 표시를 띄우지 않는다');
    });

    fakeTest('REQ-NOTI-012 조용한 갱신이 실패해도 기존 목록을 유지하고 토스트가 없다', (async) {
      final r = _rig();
      _start(async, r);
      r.repo.onPage(1, [Reply.fail(errorFx(pageFx500))]);
      resolve(async, r.vm.onResumed());
      expect(r.ids, notiIdsOf(pageFx1));
      expect(r.toast.messages, isEmpty);
      expect(r.state.status, InboxStatus.content);
    });
  });
}
