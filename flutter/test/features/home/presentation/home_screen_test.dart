import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/test_id.dart';
import 'package:chalkak/features/home/presentation/home_screen.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, widgetTest;
import '../../../support/home_fakes.dart';

const _otherPost = '22222222-2222-4222-8222-222222222202';
const _bannerId = '44444444-4444-4444-8444-444444444401';

Future<void> _pump(WidgetTester tester, HomeRig r, {bool load = true}) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: HomeScreen(
          viewModel: r.home,
          aiCardBuilder:
              (context, postId, {required topicDate, required visible}) =>
                  const TestId(
                    HomeTestIds.aiCard,
                    child: SizedBox(width: 10, height: 10),
                  ),
        ),
      ),
    ),
  );
  if (load) {
    unawaited(r.home.load());
    await _settle(tester);
  }
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 500));
  }
}

Finder _text(String id, String text) =>
    find.descendant(of: byId(id), matching: find.text(text));

void main() {
  widgetTest(
    'TC-HOME-057 TC-HOME-053 정상 상태에 testids.md 홈 식별자가 모두 존재하고 날짜 라벨은 KST 기준이다',
    (tester) async {
      final r = HomeRig();
      await _pump(tester, r);
      for (final id in [
        HomeTestIds.root,
        HomeTestIds.scroll,
        HomeTestIds.notificationButton,
        HomeTestIds.topicDate,
        HomeTestIds.topicTitle,
        HomeTestIds.heroPhoto,
        HomeTestIds.weekSection,
        HomeTestIds.rankingSection,
        HomeTestIds.rankingMoreLink,
        HomeTestIds.rankingItem(r.api.popularPostIdForTest('2026-10-26')),
        HomeTestIds.popularSection,
        HomeTestIds.popularMoreLink,
        HomeTestIds.popularItem(_otherPost),
        HomeTestIds.aiCard,
        HomeTestIds.issueSection,
        HomeTestIds.issueItem(_bannerId),
      ]) {
        expect(byId(id), findsOneWidget, reason: id);
      }
      expect(byId(HomeTestIds.notificationUnreadDot), findsNothing);
      expect(byId(HomeTestIds.loading), findsNothing);
      expect(_text(HomeTestIds.topicDate, '10월 27일 · 오늘의 주제'), findsOneWidget);
      expect(_text(HomeTestIds.topicTitle, '가을 하늘'), findsOneWidget);
    },
  );

  widgetTest('TC-HOME-001 히어로는 응답 전 로딩 문구를 보이고 응답 뒤 사라진다', (tester) async {
    final r = HomeRig();
    r.api.today([
      fx(
        'home/posts-today__posted-approved.json',
        delay: const Duration(seconds: 3),
      ),
    ]);
    await _pump(tester, r, load: false);
    unawaited(r.home.load());
    await tester.pump(const Duration(milliseconds: 500));
    expect(byId(HomeTestIds.heroLoading), findsOneWidget);
    expect(find.text(Copy.homeTopicLoading), findsWidgets);
    expect(byId(HomeTestIds.weekSection), findsOneWidget);
    await _settle(tester);
    expect(byId(HomeTestIds.heroLoading), findsNothing);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
  });

  widgetTest('TC-HOME-002 NoOpenTopic: 문구가 있고 다시 시도 버튼은 없다', (tester) async {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__404-no-open-topic.json')]);
    await _pump(tester, r);
    expect(
      _text(HomeTestIds.heroNoOpenTopic, Copy.homeHeroNoTopic),
      findsOneWidget,
    );
    expect(byId(HomeTestIds.heroRetryButton), findsNothing);
    expect(byId(HomeTestIds.heroError), findsNothing);
  });

  widgetTest('TC-HOME-003 Empty: 주제 문구와 업로드 진입 버튼이 있고 탭하면 업로드 진입 이벤트다', (
    tester,
  ) async {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__not-posted.json')]);
    await _pump(tester, r);
    expect(byId(HomeTestIds.heroEmpty), findsOneWidget);
    expect(
      find.text(Copy.fill(Copy.homeHeroEmpty, {'주제': '가을 하늘'})),
      findsOneWidget,
    );
    expect(byId(HomeTestIds.heroUploadButton), findsOneWidget);
    await tester.tap(byId(HomeTestIds.heroUploadButton));
    await tester.pump();
    expect(
      r.homeEvents.map((e) => e.runtimeType.toString()),
      contains('OpenUploadGate'),
    );
  });

  widgetTest('TC-HOME-004 Processing 문구', (tester) async {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__posted-validating.json')]);
    await _pump(tester, r);
    expect(
      _text(HomeTestIds.heroProcessing, Copy.homeHeroProcessing),
      findsOneWidget,
    );
    expect(byId(HomeTestIds.heroPhoto), findsNothing);
  });

  widgetTest('TC-HOME-005 PENDING은 사진과 검수 대기 배지가 있다', (tester) async {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__posted-pending.json')]);
    r.api.calendar(2026, 10, [
      fx('home/posts-calendar__2026-10-week-pending.json'),
    ]);
    await _pump(tester, r);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
    expect(
      _text(HomeTestIds.heroPendingBadge, Copy.homeWeeklyBadgePending),
      findsOneWidget,
    );
  });

  widgetTest('TC-HOME-006 APPROVED는 배지 없는 사진이다', (tester) async {
    final r = HomeRig();
    await _pump(tester, r);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
    expect(byId(HomeTestIds.heroPendingBadge), findsNothing);
  });

  widgetTest('TC-HOME-008 정지 회원의 히어로는 Empty와 같은 모양이다', (tester) async {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__403-banned.json')]);
    await _pump(tester, r);
    expect(byId(HomeTestIds.heroEmpty), findsOneWidget);
    expect(byId(HomeTestIds.heroError), findsNothing);
  });

  widgetTest('TC-HOME-009 Error: 문구와 다시 시도 버튼, 탭하면 복구된다', (tester) async {
    final r = HomeRig();
    r.api.today([
      ...failing('home/posts-today__500-server-error.json'),
      fx('home/posts-today__posted-approved.json'),
    ]);
    await _pump(tester, r);
    expect(_text(HomeTestIds.heroError, Copy.homeHeroError), findsOneWidget);
    expect(find.text(Copy.homeHeroRetry), findsOneWidget);
    await tester.tap(byId(HomeTestIds.heroRetryButton));
    await _settle(tester);
    expect(byId(HomeTestIds.heroError), findsNothing);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
  });

  widgetTest('TC-HOME-010 반려 후에는 Error 문구가 뜨지 않는다', (tester) async {
    final r = HomeRig();
    r.api.today([fx('home/posts-today__not-posted-after-reject.json')]);
    await _pump(tester, r);
    expect(byId(HomeTestIds.heroEmpty), findsOneWidget);
    expect(find.text(Copy.homeHeroError), findsNothing);
  });

  widgetTest('TC-HOME-018 주제 404와 오류는 서로 다른 문구다', (tester) async {
    final r = HomeRig();
    r.api.topic('2026-10-27', [fx('home/topics__404-not-found.json')]);
    await _pump(tester, r);
    expect(find.text(Copy.homeTopicNotReady), findsOneWidget);
    expect(find.text(Copy.homeTopicError), findsNothing);
    expect(
      _text(HomeTestIds.popularEmpty, Copy.homeRankingEmpty),
      findsOneWidget,
    );
  });

  widgetTest('TC-HOME-019 인기 사진 0장이면 빈 상태, 1장이면 1개만 그린다', (tester) async {
    final r = HomeRig();
    r.api.popular('2026-10-27', [fx('home/posts-list__popular-0.json')]);
    await _pump(tester, r);
    expect(byId(HomeTestIds.popularEmpty), findsOneWidget);

    final r2 = HomeRig();
    r2.api.popular('2026-10-27', [fx('home/posts-list__popular-1.json')]);
    await _pump(tester, r2);
    expect(byId(HomeTestIds.popularEmpty), findsNothing);
    expect(byId(HomeTestIds.popularItem(_otherPost)), findsOneWidget);
  });

  widgetTest('TC-HOME-017 어제 랭킹 404는 빈 상태 문구다', (tester) async {
    final r = HomeRig();
    r.api.topic('2026-10-26', [fx('home/topics__404-not-found.json')]);
    await _pump(tester, r);
    expect(
      _text(HomeTestIds.rankingEmpty, Copy.homeRankingEmpty),
      findsOneWidget,
    );
    expect(byId(HomeTestIds.popularSection), findsOneWidget);
  });

  widgetTest('TC-HOME-020 랭킹 오류는 그 섹션 제목이 들어간 문구와 다시 시도 버튼이다', (tester) async {
    final r = HomeRig();
    r.api.popular('2026-10-26', [fx('home/posts-list__500-server-error.json')]);
    await _pump(tester, r);
    expect(
      find.text(
        Copy.fill(Copy.homeRankingError, {'섹션 제목': Copy.homeRankingYesterday}),
      ),
      findsOneWidget,
    );
    expect(byId(HomeTestIds.rankingError), findsOneWidget);
    expect(byId(HomeTestIds.rankingRetryButton), findsOneWidget);
    expect(byId(HomeTestIds.popularError), findsNothing);
  });

  widgetTest('TC-HOME-024 TC-HOME-030 이번 주 7칸: 요일 헤더, N/7, 기록 있는 날만 사진', (
    tester,
  ) async {
    final r = HomeRig();
    await _pump(tester, r);
    for (final d in ['25', '26', '27', '28', '29', '30', '31']) {
      expect(
        byId(HomeTestIds.weekDay('2026-10-$d')),
        findsOneWidget,
        reason: d,
      );
    }
    for (final d in ['25', '26', '27']) {
      expect(
        byId(HomeTestIds.weekPhoto('2026-10-$d')),
        findsOneWidget,
        reason: d,
      );
    }
    for (final d in ['28', '29', '30', '31']) {
      expect(
        byId(HomeTestIds.weekPhoto('2026-10-$d')),
        findsNothing,
        reason: d,
      );
    }
    expect(find.text(Copy.homeWeeklyTitle), findsOneWidget);
    expect(find.text('3/7'), findsOneWidget);
    expect(find.text(Copy.homeWeeklyMore), findsOneWidget);
    for (final w in ['일', '월', '화', '수', '목', '금', '토']) {
      expect(find.text(w), findsWidgets, reason: w);
    }
  });

  widgetTest('TC-HOME-030 PENDING 칸에는 "대기" 라벨이 붙는다', (tester) async {
    final r = HomeRig();
    r.api.calendar(2026, 10, [
      fx('home/posts-calendar__2026-10-week-pending.json'),
    ]);
    await _pump(tester, r);
    expect(find.text(Copy.homeWeeklyPending), findsOneWidget);
  });

  widgetTest('TC-HOME-032 주간 기록 오류는 문구와 섹션 다시 시도이고 히어로는 그대로다', (tester) async {
    final r = HomeRig();
    r.api.calendar(2026, 10, [
      fx('home/posts-calendar__500-server-error.json'),
    ]);
    await _pump(tester, r);
    expect(_text(HomeTestIds.weekError, Copy.homeWeeklyError), findsOneWidget);
    expect(byId(HomeTestIds.weekRetryButton), findsOneWidget);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
  });

  widgetTest('TC-HOME-050 hasUnread=true일 때만 알림 버튼에 미읽음 점이 있다', (tester) async {
    final r = HomeRig();
    r.api.unread([fx('home/notifications-unread-status__true.json')]);
    await _pump(tester, r);
    expect(byId(HomeTestIds.notificationUnreadDot), findsOneWidget);
    r.api.unread([fx('home/notifications-unread-status__false.json')]);
    unawaited(r.home.refreshUnread());
    await _settle(tester);
    expect(byId(HomeTestIds.notificationUnreadDot), findsNothing);
  });

  widgetTest('TC-HOME-048 알림 버튼 탭은 알림함 이벤트다', (tester) async {
    final r = HomeRig();
    await _pump(tester, r);
    await tester.tap(byId(HomeTestIds.notificationButton));
    await tester.pump();
    expect(
      r.homeEvents.map((e) => e.runtimeType.toString()),
      contains('OpenNotifications'),
    );
  });

  widgetTest('TC-HOME-035 새로고침 중에는 인디케이터가 보이고 기존 콘텐츠가 유지된다', (tester) async {
    final r = HomeRig();
    await _pump(tester, r);
    r.api.today([
      fx(
        'home/posts-today__posted-approved.json',
        delay: const Duration(seconds: 2),
      ),
    ]);
    unawaited(r.home.refresh());
    await tester.pump(const Duration(milliseconds: 500));
    expect(byId(HomeTestIds.refreshIndicator), findsOneWidget);
    expect(byId(HomeTestIds.heroPhoto), findsOneWidget);
    await _settle(tester);
    expect(byId(HomeTestIds.refreshIndicator), findsNothing);
  });

  widgetTest('TC-HOME-054 AI 카드 영역은 승인된 오늘 사진일 때만 존재한다', (tester) async {
    final r = HomeRig();
    await _pump(tester, r);
    expect(byId(HomeTestIds.aiCard), findsOneWidget);

    final r2 = HomeRig();
    r2.api.today([fx('home/posts-today__posted-pending.json')]);
    await _pump(tester, r2);
    expect(byId(HomeTestIds.aiCard), findsNothing);
    expect(r2.api.aiReviewCalls, 0);
  });

  widgetTest(
    'TC-BANR-004 TC-BANR-029 ISSUE 섹션은 배너마다 하나의 카드이고 제목·부제목을 접근성 라벨로 읽는다',
    (tester) async {
      final r = HomeRig();
      await _pump(tester, r);
      expect(find.text(Copy.homeBannerTitle), findsOneWidget);
      expect(byId(HomeTestIds.issueItem(_bannerId)), findsOneWidget);
      final semantics = tester.getSemantics(
        byId(HomeTestIds.issueItem(_bannerId)),
      );
      expect(semantics.label, allOf(contains('이슈 1'), contains('찰칵 소식 1')));
      expect(find.text('이슈 1'), findsOneWidget);
      expect(find.text('찰칵 소식 1'), findsOneWidget);
    },
  );

  widgetTest('TC-BANR-010 배너가 0건이거나 최초 조회가 실패하면 ISSUE 섹션이 트리에 없다', (
    tester,
  ) async {
    final r = HomeRig();
    r.api.banners(1, [fx('banner/banners__empty.json')]);
    await _pump(tester, r);
    expect(byId(HomeTestIds.issueSection), findsNothing);
    expect(
      byId(HomeTestIds.weekSection),
      findsOneWidget,
      reason: '다른 섹션은 영향 없음',
    );

    final r2 = HomeRig();
    r2.api.banners(1, [fx('banner/banners__500-server-error.json')]);
    await _pump(tester, r2);
    expect(byId(HomeTestIds.issueSection), findsNothing);
    expect(byId(HomeTestIds.popularSection), findsOneWidget);
  });

  widgetTest('TC-BANR-007 썸네일 URL이 잘못된 배너도 카드는 그려진다', (tester) async {
    final r = HomeRig();
    r.api.banners(1, [fx('banner/banners__bad-thumbnail.json')]);
    await _pump(tester, r);
    expect(
      byId(HomeTestIds.issueItem('44444444-4444-4444-8444-444444444402')),
      findsOneWidget,
    );
  });

  widgetTest('TC-HOME-012 게스트 홈: 히어로 Empty, 이번 주 7칸은 사진 없음', (tester) async {
    final r = HomeRig(guest: true);
    await _pump(tester, r);
    expect(byId(HomeTestIds.heroEmpty), findsOneWidget);
    expect(byId(HomeTestIds.weekDay('2026-10-27')), findsOneWidget);
    expect(
      find.byWidgetPredicate(
        (w) =>
            w.key is ValueKey<String> &&
            (w.key! as ValueKey<String>).value.startsWith('home.week-photo-'),
      ),
      findsNothing,
    );
    expect(byId(HomeTestIds.notificationUnreadDot), findsNothing);
  });
}
