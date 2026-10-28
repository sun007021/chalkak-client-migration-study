import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_view_model.dart';
import 'package:clock/clock.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show advance, settle;

final _yesterday = day('2026-10-26');
final _first = KstDate.firstTopic;

/// 오늘 최신순과 지난 날짜들의 인기순 목록을 걸어 둔 리그.
DisplayRig _rig({
  bool guest = false,
  KstDate? date,
  DisplaySort sort = DisplaySort.recent,
}) {
  final r = DisplayRig(guest: guest, initialDate: date, initialSort: sort);
  r.serveTodayRecent();
  for (final d in [
    '2026-10-26',
    '2026-10-25',
    '2026-10-24',
    '2026-10-22',
    '2026-10-20',
    '2026-10-01',
    '2026-09-30',
    '2026-09-18',
    '2026-09-17',
  ]) {
    r.repo.servePage(day(d), DisplaySort.popular, 1, popularP1Fx);
  }
  return r;
}

void _load(FakeAsync async, DisplayRig r, [Duration wait = Duration.zero]) {
  r.vm.load();
  advance(async, wait);
}

void main() {
  group('첫 로딩', () {
    fakeTest('TC-DISP-001 응답 전에는 loading이고 날짜 이동 버튼이 모두 비활성이다', (async) {
      final r = _rig();
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 1)),
      ]);
      _load(async, r, const Duration(milliseconds: 500));
      expect(r.state.status, DisplayStatus.loading);
      expect(r.state.canGoPrevious, isFalse);
      expect(r.state.canGoNext, isFalse);
      r.vm.goPrevious();
      r.vm.selectDate(_yesterday);
      settle(async);
      expect(r.repo.topicCalls, [today], reason: '첫 로딩 중 날짜 이동은 막힌다');
      advance(async, const Duration(seconds: 1));
      expect(r.state.status, DisplayStatus.content);
      expect(r.state.canGoPrevious, isTrue);
      expect(r.state.canGoNext, isFalse, reason: '오늘에서는 다음이 비활성');
    });

    fakeTest('REQ-DISP-001 날짜를 지정해 열면 그 날짜의 전시를 연다(지난 날짜는 popular)', (async) {
      final r = _rig(date: _yesterday);
      _load(async, r);
      expect(r.repo.topicCalls, [_yesterday]);
      expect(r.repo.postsCalls.single.sort, DisplaySort.popular);
      expect(r.state.selectedDate, _yesterday);
      expect(r.state.isArchive, isTrue);
    });

    fakeTest('TC-DISP-002 주제를 먼저 확인한 뒤 응답 topicDate로 posts를 부르고 목록을 매핑한다', (
      async,
    ) {
      final r = _rig();
      r.repo.onTopic(today, [
        Reply.ok(topicFx(topicOpenFx), delay: const Duration(seconds: 1)),
      ]);
      _load(async, r, const Duration(milliseconds: 500));
      expect(r.repo.postsCalls, isEmpty, reason: '주제 응답 전에는 posts를 부르지 않는다');
      advance(async, const Duration(seconds: 1));
      expect(r.repo.postsCalls.single.date, today);
      expect(r.repo.postsCalls.single.sort, DisplaySort.recent);
      expect(r.repo.postsCalls.single.page, 1);
      expect(r.repo.postsCalls.single.randomSeed, isNull);
      expect(r.itemIds, idsOf(recentP1Fx));
      expect(r.state.status, DisplayStatus.content);
      expect(r.state.hasNext, isTrue);
      expect(r.state.sort, DisplaySort.recent);
      expect(r.state.isArchive, isFalse);
      expect(r.state.topic!.title, '가을 하늘');
    });

    fakeTest(
      'TC-DISP-005 첫 로드가 500이면 요청 날짜를 유지한 오류 상태이고 다시 시도하면 같은 날짜로 재요청한다',
      (async) {
        final r = _rig();
        r.repo.onPosts(today, DisplaySort.recent, 1, [
          Reply.fail(errorFx(posts500Fx)),
          Reply.ok(pageFx(recentP1Fx)),
        ]);
        _load(async, r);
        expect(r.state.status, DisplayStatus.error);
        expect(r.state.errorText, Copy.displayError);
        expect(r.state.selectedDate, today);
        expect(r.state.items, isEmpty);
        r.vm.retry();
        advance(async, Duration.zero);
        expect(r.repo.postsCalls.map((c) => c.date), [today, today]);
        expect(r.state.status, DisplayStatus.content);
        expect(r.itemIds, idsOf(recentP1Fx));
      },
    );

    fakeTest('TC-DISP-005 연결 실패면 "네트워크 연결을 확인해 주세요."를 보여 준다', (async) {
      final r = _rig();
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.fail(networkError()),
      ]);
      _load(async, r);
      expect(r.state.status, DisplayStatus.error);
      expect(r.state.errorText, Copy.commonErrorNetwork);
    });

    fakeTest('TC-DISP-005 주제 조회가 500이어도 오류 상태이고 같은 날짜로 다시 시도할 수 있다', (async) {
      final r = _rig();
      r.repo.onTopic(today, [
        Reply.fail(errorFx(topic500Fx)),
        Reply.ok(topicFx(topicOpenFx)),
      ]);
      _load(async, r);
      expect(r.state.status, DisplayStatus.error);
      r.vm.retry();
      advance(async, Duration.zero);
      expect(r.repo.topicCalls, [today, today]);
      expect(r.state.status, DisplayStatus.content);
    });

    fakeTest('TC-DISP-006 오늘 주제가 없으면(404) 오류가 아니라 빈 상태다', (async) {
      final r = _rig();
      r.repo.onTopic(today, [Reply.fail(errorFx(topic404Fx))]);
      _load(async, r);
      expect(r.state.status, DisplayStatus.empty);
      expect(r.state.errorText, isNull);
      expect(r.state.selectedDate, today);
      expect(r.repo.postsCalls, isEmpty);
      expect(r.state.canGoPrevious, isTrue, reason: '빈 상태에서도 날짜 이동은 가능');
    });

    fakeTest('TC-DISP-007 posts가 404여도 빈 상태이고 날짜 이동은 가능하다', (async) {
      final r = _rig();
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.fail(errorFx(posts404Fx)),
      ]);
      _load(async, r);
      expect(r.state.status, DisplayStatus.empty);
      expect(r.state.errorText, isNull);
      expect(r.state.canGoPrevious, isTrue);
    });

    fakeTest('TC-DISP-007 사진이 0장이어도 빈 상태다', (async) {
      final r = _rig();
      r.repo.servePage(today, DisplaySort.recent, 1, page99Fx);
      _load(async, r);
      expect(r.state.status, DisplayStatus.empty);
    });

    fakeTest('TC-DISP-008 400(미래 날짜·조회 조건)은 일반 오류 상태이고 자동 재시도하지 않는다', (async) {
      for (final fx in [posts400FutureFx, posts400QueryFx]) {
        final r = _rig();
        r.repo.onPosts(today, DisplaySort.recent, 1, [Reply.fail(errorFx(fx))]);
        _load(async, r, const Duration(seconds: 30));
        expect(r.state.status, DisplayStatus.error, reason: fx);
        expect(r.state.errorText, Copy.displayError, reason: fx);
        expect(r.repo.postsCalls, hasLength(1), reason: fx);
      }
    });

    fakeTest('TC-DISP-009 주제 phase가 BEFORE_OPEN·CLOSED여도 posts를 조회해 보여 준다', (
      async,
    ) {
      for (final phase in ['BEFORE_OPEN', 'CLOSED']) {
        final r = _rig();
        r.repo.onTopic(today, [Reply.ok(topicFx(topicOpenFx, phase: phase))]);
        _load(async, r);
        expect(r.state.status, DisplayStatus.content, reason: phase);
        expect(r.itemIds, idsOf(recentP1Fx), reason: phase);
      }
    });

    fakeTest('TC-DISP-041 날짜 라벨은 응답 topicDate의 "M월 d일"(0 패딩 없음)이다', (async) {
      final r = _rig();
      r.repo.onTopic(today, [Reply.ok(topicFx(topicOpenFx))]);
      _load(async, r);
      expect(r.state.dateLabel, '10월 27일');
      final r2 = _rig(date: _first);
      r2.repo.onTopic(_first, [Reply.ok(topicFx(topicFirstFx))]);
      _load(async, r2);
      expect(r2.state.dateLabel, '9월 17일');
      final d5 = day('2026-10-05');
      final r3 = _rig(date: d5);
      r3.repo.onTopic(d5, [Reply.ok(topicOn(d5))]);
      r3.repo.servePage(d5, DisplaySort.popular, 1, popularP1Fx);
      _load(async, r3);
      expect(r3.state.dateLabel, '10월 5일');
    });
  });

  group('날짜 이동 범위', () {
    fakeTest('TC-DISP-028 최초 전시일에서는 이전 버튼이 비활성이고 이동해도 요청이 없다', (async) {
      final r = _rig(date: _first);
      _load(async, r);
      expect(r.state.canGoPrevious, isFalse);
      final calls = r.repo.topicCalls.length;
      r.vm.goPrevious();
      settle(async);
      expect(r.repo.topicCalls, hasLength(calls));
      expect(r.state.selectedDate, _first);
    });

    fakeTest('TC-DISP-028 2026-09-18에서 이전은 2026-09-17로 이동한다', (async) {
      final r = _rig(date: day('2026-09-18'));
      _load(async, r);
      expect(r.state.canGoPrevious, isTrue);
      r.vm.goPrevious();
      settle(async);
      expect(r.repo.topicCalls.last, _first);
      expect(r.state.selectedDate, _first);
      expect(r.state.canGoPrevious, isFalse);
    });

    fakeTest('TC-DISP-029 오늘에서 다음은 이동하지 않고, 어제에서 다음은 오늘이다', (async) {
      final r = _rig();
      _load(async, r);
      expect(r.state.canGoNext, isFalse);
      final calls = r.repo.topicCalls.length;
      r.vm.goNext();
      settle(async);
      expect(r.repo.topicCalls, hasLength(calls));
      expect(r.state.selectedDate, today);

      final r2 = _rig(date: _yesterday);
      _load(async, r2);
      expect(r2.state.canGoNext, isTrue);
      r2.vm.goNext();
      settle(async);
      expect(r2.repo.topicCalls.last, today);
      expect(r2.state.selectedDate, today);
      expect(r2.state.canGoNext, isFalse);
    });

    fakeTest('TC-DISP-028 TC-DISP-029 이전·다음 화살표는 하루씩 옮기고 옮긴 날짜를 불러온다', (async) {
      final r = _rig();
      _load(async, r);
      r.vm.goPrevious();
      settle(async);
      expect(r.state.selectedDate, _yesterday);
      expect(r.state.dateLabel, '10월 26일');
      expect(r.state.isArchive, isTrue);
      expect(r.state.showSortTabs, isFalse);
    });

    fakeTest('TC-DISP-034 범위 밖 날짜를 고르면 가장 가까운 범위 끝으로 맞춰 불러온다', (async) {
      final r = _rig();
      _load(async, r);
      r.vm.selectDate(day('2026-09-01'));
      settle(async);
      expect(r.repo.topicCalls.last, _first);
      expect(r.state.selectedDate, _first);
      final calls = r.repo.topicCalls.length;
      r.vm.selectDate(day('2027-01-01')); // 미래 -> 오늘
      settle(async);
      expect(r.state.selectedDate, today);
      expect(r.repo.topicCalls.last, today);
      expect(r.repo.topicCalls.length, greaterThan(calls));
    });

    fakeTest('TC-DISP-035 지금 선택된 날짜를 다시 고르면 재요청하지 않는다', (async) {
      final r = _rig();
      _load(async, r);
      final topics = r.repo.topicCalls.length;
      final posts = r.repo.postsCalls.length;
      r.vm.selectDate(today);
      settle(async);
      expect(r.repo.topicCalls, hasLength(topics));
      expect(r.repo.postsCalls, hasLength(posts));
    });

    fakeTest('TC-DISP-030 월·연 경계: 2026-10-01 이전은 2026-09-30', (async) {
      final r = _rig(date: day('2026-10-01'));
      _load(async, r);
      r.vm.goPrevious();
      settle(async);
      expect(r.repo.topicCalls.last.toApiString(), '2026-09-30');
    });

    test(
      'TC-DISP-030 연 경계: 2027-01-01 이전은 2026-12-31, 2026-12-31 다음은 2027-01-01',
      () {
        withClock(Clock.fixed(DateTime.utc(2027, 1, 5, 3)), () {
          fakeAsync((async) {
            final r = DisplayRig(initialDate: day('2027-01-01'));
            for (final d in ['2027-01-01', '2026-12-31']) {
              r.repo.servePage(day(d), DisplaySort.popular, 1, popularP1Fx);
            }
            r.vm.load();
            advance(async, Duration.zero);
            r.vm.goPrevious();
            settle(async);
            expect(r.repo.topicCalls.last.toApiString(), '2026-12-31');
            r.vm.goNext();
            settle(async);
            expect(r.repo.topicCalls.last.toApiString(), '2027-01-01');
          }, initialTime: DateTime.utc(2027, 1, 5, 3));
        });
      },
    );

    test(
      'TC-DISP-039 KST 23:59:59(14:59:59Z)의 상한은 10-27, 15:00:00Z에는 10-28이다',
      () {
        for (final (instant, expected) in [
          (DateTime.utc(2026, 10, 27, 14, 59, 59), '2026-10-27'),
          (DateTime.utc(2026, 10, 27, 15), '2026-10-28'),
        ]) {
          fakeAsync((async) {
            withClock(Clock.fixed(instant), () {
              final r = DisplayRig();
              final t = day(expected);
              r.repo.servePage(t, DisplaySort.recent, 1, recentP1Fx);
              r.vm.load();
              advance(async, Duration.zero);
              expect(r.state.today.toApiString(), expected);
              expect(r.state.selectedDate.toApiString(), expected);
              expect(r.state.canGoNext, isFalse);
            });
          }, initialTime: instant);
        }
      },
    );

    fakeTest('TC-DISP-040 자정 이후 복귀하면 상한만 새 오늘로 갱신하고 보던 날짜·요청은 그대로다', (async) {
      final r = _rig();
      _load(async, r);
      final posts = r.repo.postsCalls.length;
      async.elapse(const Duration(hours: 13)); // KST 10-28 01:00
      r.vm.onResumed();
      settle(async);
      expect(r.state.today, day('2026-10-28'));
      expect(r.state.selectedDate, today);
      expect(r.state.canGoNext, isTrue);
      expect(r.repo.postsCalls, hasLength(posts));
      expect(r.state.status, DisplayStatus.content);
    });
  });

  group('날짜 이동 실패와 stale', () {
    fakeTest('TC-DISP-031 이동한 날짜의 주제가 404이면 직전 전시를 복원하고 안내 토스트를 띄운다', (async) {
      final r = _rig();
      _load(async, r);
      final before = r.itemIds;
      r.repo.onTopic(_yesterday, [Reply.fail(errorFx(topic404Fx))]);
      r.vm.goPrevious();
      settle(async);
      expect(r.state.selectedDate, today);
      expect(r.state.status, DisplayStatus.content);
      expect(r.itemIds, before);
      expect(r.state.isNavigating, isFalse);
      expect(r.toastTexts, [Copy.displayDateMissing]);
      expect(r.state.canGoPrevious, isTrue, reason: '최초 전시일 경계를 새로 만들지 않는다');
    });

    fakeTest('TC-DISP-032 날짜 선택으로 여러 날을 건너뛴 날짜가 404여도 직전 전시를 복원한다', (async) {
      final r = _rig();
      _load(async, r);
      final before = r.itemIds;
      r.repo.onTopic(day('2026-10-01'), [Reply.fail(errorFx(topic404Fx))]);
      r.vm.selectDate(day('2026-10-01'));
      settle(async);
      expect(r.state.selectedDate, today);
      expect(r.itemIds, before);
      expect(r.toastTexts, [Copy.displayDateMissing]);
      expect(r.state.canGoPrevious, isTrue);
    });

    fakeTest('TC-DISP-033 이동 중 실패는 직전 전시를 복원하고 토스트: 5xx는 일반, 연결 실패는 네트워크 문구', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      final before = r.itemIds;
      r.repo.onTopic(_yesterday, [
        Reply.fail(errorFx(topic500Fx)),
        Reply.fail(networkError()),
        Reply.ok(topicOn(_yesterday)),
      ]);
      r.vm.goPrevious();
      settle(async);
      expect(r.state.selectedDate, today);
      expect(r.itemIds, before);
      r.vm.goPrevious();
      settle(async);
      expect(r.state.selectedDate, today);
      expect(r.toastTexts, [Copy.displayError, Copy.commonErrorNetwork]);
      r.vm.goPrevious(); // 경계가 생기지 않았으니 다시 이동할 수 있다
      settle(async);
      expect(r.state.selectedDate, _yesterday);
    });

    fakeTest('TC-DISP-033 이동 중 posts 실패도 직전 전시를 복원한다', (async) {
      final r = _rig();
      _load(async, r);
      final before = r.itemIds;
      r.repo.onPosts(_yesterday, DisplaySort.popular, 1, [
        Reply.fail(networkError()),
      ]);
      r.vm.goPrevious();
      settle(async);
      expect(r.state.selectedDate, today);
      expect(r.itemIds, before);
      expect(r.toastTexts, [Copy.commonErrorNetwork]);
    });

    fakeTest('TC-DISP-038 이전 버튼을 연타해도 최종 표시는 마지막 날짜이고 중간 날짜의 늦은 응답이 덮지 않는다', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      r.repo.onPosts(_yesterday, DisplaySort.popular, 1, [
        Reply.ok(pageFx(popularP1Fx), delay: const Duration(seconds: 3)),
      ]);
      r.repo.onPosts(day('2026-10-25'), DisplaySort.popular, 1, [
        Reply.ok(pageFx(popularP1Fx), delay: const Duration(seconds: 2)),
      ]);
      r.repo.onPosts(day('2026-10-24'), DisplaySort.popular, 1, [
        Reply.ok(pageFx(popular3Fx), delay: const Duration(seconds: 1)),
      ]);
      r.vm.goPrevious();
      r.vm.goPrevious();
      r.vm.goPrevious();
      settle(async);
      expect(r.state.selectedDate, day('2026-10-24'));
      advance(async, const Duration(seconds: 1));
      expect(r.itemIds, idsOf(popular3Fx));
      advance(async, const Duration(seconds: 5));
      expect(r.state.selectedDate, day('2026-10-24'));
      expect(r.itemIds, idsOf(popular3Fx), reason: '늦은 응답이 최종 화면을 덮으면 안 된다');
      expect(r.state.isNavigating, isFalse);
    });

    fakeTest('TC-DISP-046 날짜 A→B로 이동한 뒤 A의 느린 응답이 도착해도 B 화면을 덮지 않는다', (async) {
      final r = _rig();
      _load(async, r);
      final a = day('2026-10-20');
      final b = day('2026-10-22');
      r.repo.onPosts(a, DisplaySort.popular, 1, [
        Reply.ok(pageFx(popularP1Fx), delay: const Duration(seconds: 3)),
      ]);
      r.repo.onPosts(b, DisplaySort.popular, 1, [
        Reply.ok(pageFx(popular3Fx), delay: const Duration(seconds: 1)),
      ]);
      r.vm.selectDate(a);
      r.vm.selectDate(b);
      advance(async, const Duration(seconds: 1));
      expect(r.state.selectedDate, b);
      expect(r.itemIds, idsOf(popular3Fx));
      advance(async, const Duration(seconds: 3));
      expect(r.state.selectedDate, b);
      expect(r.itemIds, idsOf(popular3Fx));
    });
  });

  group('수명과 계정', () {
    fakeTest('TC-DISP-048 화면을 떠나(dispose) 요청이 취소돼도 오류 토스트·상태 변화가 없다', (async) {
      final r = _rig();
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 2)),
      ]);
      _load(async, r, const Duration(milliseconds: 500));
      r.vm.dispose();
      advance(async, const Duration(seconds: 5));
      expect(r.events, isEmpty);
    });

    fakeTest('TC-DISP-049 로그아웃 후 다른 사용자로 다시 열면 이전 사용자의 isLiked·캐시가 보이지 않는다', (
      async,
    ) {
      final r = _rig();
      _load(async, r);
      expect(r.card(postIdOf(3)).isLiked, isTrue, reason: 'A는 이 사진을 좋아요했다');
      r.likes.reset();
      r.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(guestP1Fx), delay: const Duration(seconds: 1)),
      ]);
      r.vm.onAccountChanged();
      settle(async);
      expect(r.state.items, isEmpty, reason: 'A의 캐시가 B 화면에 잠깐도 보이면 안 된다');
      expect(r.state.status, DisplayStatus.loading);
      advance(async, const Duration(seconds: 2));
      expect(r.state.status, DisplayStatus.content);
      expect(r.card(postIdOf(3)).isLiked, isFalse);
      expect(r.repo.postsCalls.last.randomSeed, isNull);
    });
  });

  group('게스트', () {
    fakeTest('TC-DISP-053 게스트도 전시를 보고 isLiked·isMine은 모두 false로 다룬다', (async) {
      final r = _rig(guest: true);
      _load(async, r);
      expect(r.state.status, DisplayStatus.content);
      expect(r.itemIds, idsOf(recentP1Fx));
      expect(r.state.items.any((c) => c.isLiked || c.isMine), isFalse);
    });

    fakeTest('TC-DISP-054 TC-FEED-005 게스트가 사진을 누르면 토스트만 뜨고 상세 열기 이벤트가 없다', (
      async,
    ) {
      final r = _rig(guest: true);
      _load(async, r);
      r.vm.onPostTapped(postIdOf(2));
      settle(async);
      expect(r.toastTexts, [Copy.guestFeed]);
      expect(r.openedFeeds, isEmpty);
    });

    fakeTest('TC-DISP-055 로그인 사용자가 사진을 누르면 목록 값을 시드로 상세를 연다', (async) {
      final r = _rig();
      _load(async, r);
      r.vm.onPostTapped(postIdOf(3));
      settle(async);
      final t = r.openedFeeds.single;
      final card = cardOf(recentP1Fx, postIdOf(3));
      expect(t.postId, postIdOf(3));
      expect(t.seed!.originalImageUrl, card.originalImageUrl);
      expect(t.seed!.likeCount, card.likeCount);
      expect(t.seed!.isLiked, card.isLiked);
      expect(t.seed!.title, card.title);
      expect(t.seed!.topicDate, today);
      expect(t.isMine, isFalse);
      r.vm.onPostTapped(myPostId);
      settle(async);
      expect(r.openedFeeds.last.isMine, isTrue);
    });
  });
}
