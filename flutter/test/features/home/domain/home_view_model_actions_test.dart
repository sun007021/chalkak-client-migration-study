import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/home/domain/home_state.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/home_fakes.dart';
import '../../../support/net_harness.dart';

void main() {
  group('게스트 (D-05)', () {
    fakeTest(
      'TC-HOME-012 TC-NAV-014 TC-BANR-009 게스트 홈은 주제·랭킹·배너만 인증 헤더 없이 부르고 인증 API는 0건이다',
      (async) {
        final r = HomeRig(guest: true);
        r.loadHome(async);
        expect(r.api.authenticatedCalls, 0);
        expect(r.api.todayCalls, 0);
        expect(r.api.calendarCalls, 0);
        expect(r.api.unreadCalls, 0);
        expect(r.http.adapter.requests.any((q) => q.hasAuthorization), isFalse);
        expect(r.home.state.hero, isA<HeroEmpty>());
        final days = (r.home.state.weekly as WeeklyReady).days;
        expect(days, hasLength(7));
        expect(days.every((d) => d.entry == null), isTrue);
        expect(r.home.state.popular, isA<RankingReady>());
        expect(r.home.state.banners.items, isNotEmpty);
        expect(r.home.state.hasUnread, isFalse);
      },
    );

    fakeTest('TC-BANR-009 게스트도 랭킹이 실패해도 배너는 독립적으로 표시된다', (async) {
      final r = HomeRig(guest: true);
      r.api.popular('2026-10-27', [
        fx('home/posts-list__500-server-error.json'),
      ]);
      r.loadHome(async);
      expect(r.home.state.popular, isA<RankingError>());
      expect(r.home.state.banners.items, hasLength(10));
    });

    fakeTest('TC-HOME-013 게스트 히어로 탭은 로그인 토스트이고 요청·이동이 없다', (async) {
      final r = HomeRig(guest: true);
      r.loadHome(async);
      final calls = r.api.totalCalls;
      r.home.onHeroPressed();
      settle(async);
      expect(r.toast.messages, [Copy.homeGuestUpload]);
      expect(r.homeEvents, isEmpty);
      expect(r.api.totalCalls, calls);
    });

    fakeTest('TC-HOME-022 TC-NAV-018 게스트 랭킹 사진 탭은 토스트이고 상세 요청이 0건이다', (async) {
      final r = HomeRig(guest: true);
      r.loadHome(async);
      r.home.onRankingItemPressed('22222222-2222-4222-8222-222222222202');
      settle(async);
      expect(r.toast.messages, [Copy.homeGuestFeed]);
      expect(r.homeEvents.whereType<OpenFeed>(), isEmpty);
      expect(r.api.postDetailCalls, 0);
    });

    fakeTest('TC-NAV-019 게스트 좋아요는 토스트이고 요청이 0건이다', (async) {
      final r = HomeRig(guest: true);
      r.loadHome(async);
      final calls = r.api.totalCalls;
      r.home.onLikePressed('22222222-2222-4222-8222-222222222202');
      settle(async);
      expect(r.toast.messages, [Copy.homeGuestLike]);
      expect(r.api.totalCalls, calls);
      expect(r.likes.toggled, isEmpty);
    });

    fakeTest('TC-HOME-049 TC-NAV-020 게스트 알림 버튼은 토스트이고 알림함도 미읽음 조회도 없다', (
      async,
    ) {
      final r = HomeRig(guest: true);
      r.loadHome(async);
      r.home.onNotificationPressed();
      r.home.refreshUnread();
      settle(async);
      expect(r.toast.messages, [Copy.homeGuestNotification]);
      expect(r.homeEvents.whereType<OpenNotifications>(), isEmpty);
      expect(r.api.unreadCalls, 0);
    });

    fakeTest('TC-BANR-027 게스트도 배너 카드를 누르면 열린다', (async) {
      final r = HomeRig(guest: true);
      r.loadHome(async);
      r.home.onBannerPressed(r.home.state.banners.items.first);
      settle(async);
      expect(r.homeEvents.whereType<OpenBanner>(), hasLength(1));
      expect(r.toast.messages, isEmpty);
    });
  });

  group('이동 이벤트', () {
    fakeTest('TC-HOME-021 로그인 사용자의 좋아요는 토스트 없이 공용 좋아요 위임 대상에게 넘긴다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.home.onLikePressed('22222222-2222-4222-8222-222222222202');
      expect(r.likes.toggled, ['22222222-2222-4222-8222-222222222202']);
      expect(r.toast.messages, isEmpty);
    });

    fakeTest('TC-HOME-003 Empty 히어로 탭은 업로드 진입 게이트 이벤트다', (async) {
      final r = HomeRig();
      r.api.today([fx('home/posts-today__not-posted.json')]);
      r.loadHome(async);
      r.home.onHeroPressed();
      settle(async);
      expect(r.homeEvents.whereType<OpenUploadGate>(), hasLength(1));
    });

    fakeTest('REQ-HOME 사진·처리 중·오류 히어로를 눌러도 이동이 없다(확인 필요 항목의 임시 동작)', (async) {
      for (final name in [
        'posted-approved',
        'posted-pending',
        'posted-validating',
        '404-no-open-topic',
      ]) {
        final r = HomeRig();
        r.api.today([fx('home/posts-today__$name.json')]);
        r.loadHome(async);
        r.home.onHeroPressed();
        settle(async);
        expect(r.homeEvents, isEmpty, reason: name);
        expect(r.toast.messages, isEmpty, reason: name);
      }
    });

    fakeTest('TC-HOME-021 랭킹 사진 탭은 목록 값을 시드로 담은 피드 이동이다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      final post = (r.home.state.popular as RankingReady).posts.first;
      r.home.onRankingItemPressed(post.id);
      settle(async);
      final event = r.homeEvents.whereType<OpenFeed>().single;
      expect(event.post.id, post.id);
      expect(event.post.thumbnailImageUrl, post.thumbnailImageUrl);
      expect(event.post.likeCount, post.likeCount);
    });

    fakeTest('TC-HOME-023 TC-NAV-035 더보기는 그 섹션 날짜의 인기순 전시다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.home.onRankingMorePressed(RankingKind.yesterday);
      r.home.onRankingMorePressed(RankingKind.popular);
      settle(async);
      final events = r.homeEvents.whereType<OpenDisplayTab>().toList();
      expect(events[0].date, const KstDate(2026, 10, 26));
      expect(events[0].popular, isTrue);
      expect(events[1].date, const KstDate(2026, 10, 27));
      expect(events[1].popular, isTrue);
    });

    fakeTest('TC-HOME-031 기록 있는 칸은 기록 탭의 그 날짜로, 빈 칸은 아무 일도 없다, 보러가기는 기록 탭', (
      async,
    ) {
      final r = HomeRig();
      r.loadHome(async);
      r.home.onWeekDayPressed(const KstDate(2026, 10, 26));
      r.home.onWeekDayPressed(const KstDate(2026, 10, 29));
      r.home.onWeekMorePressed();
      settle(async);
      final events = r.homeEvents.whereType<OpenRecordTab>().toList();
      expect(events, hasLength(2));
      expect(events[0].date, const KstDate(2026, 10, 26));
      expect(events[1].date, isNull);
    });

    fakeTest('TC-HOME-048 알림 버튼은 알림함 이동이다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.home.onNotificationPressed();
      settle(async);
      expect(r.homeEvents.whereType<OpenNotifications>(), hasLength(1));
    });

    fakeTest('TC-BANR-012 배너 카드 탭은 그 배너 이벤트다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      final item = r.home.state.banners.items[2];
      r.home.onBannerPressed(item);
      settle(async);
      expect(r.homeEvents.whereType<OpenBanner>().single.item.id, item.id);
    });

    fakeTest('TC-BANR-012 마지막에서 두 번째 배너가 보이면 다음 페이지를 불러온다', (async) {
      final r = HomeRig();
      r.loadHome(async);
      r.home.onBannerVisible(8);
      advance(async, const Duration(seconds: 3));
      expect(r.api.bannerPagesRequested, ['1', '2']);
      expect(r.home.state.banners.items, hasLength(13));
    });
  });
}
