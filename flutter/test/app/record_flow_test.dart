import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_test_ids.dart';
import 'package:chalkak/features/feed/domain/post_detail.dart';
import 'package:chalkak/features/feed/presentation/feed_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:chalkak/features/record/presentation/record_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/display_fakes.dart';
import '../support/home_fakes.dart' show fx;
import '../support/net_harness.dart';
import '../support/record_fakes.dart' show postOct31;

/// 메인 셸 위에서 홈 -> 기록 탭 -> 피드로 이어지는 앱 수준 흐름.
/// 기록과 홈 이번 주는 같은 `/posts/calendar`를 쓰므로 홈의 스크립트로 기록 응답을 건다.
Future<AppHarness> _enterMain(WidgetTester tester) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final h = AppHarness(
    session: sessionAt(userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  );
  h.homeFakes.api.standard();
  h.homeFakes.api.calendar(2026, 10, [
    fx('record/posts-calendar__2026-10.json'),
  ]);
  h.homeFakes.http.adapter.on('GET', '$v1/posts/calendar/months', [
    fx('record/posts-calendar-months__recent-first.json'),
  ]);
  // 상세 응답의 id는 fixture 그대로라 기록의 postId와 달라도 화면은 열린다.
  h.homeFakes.displayRepository.servePage(
    const KstDate(2026, 10, 20),
    DisplaySort.popular,
    1,
    popularP1Fx,
  );
  h.homeFakes.displayRepository.servePage(
    const KstDate(2026, 10, 20),
    DisplaySort.popular,
    2,
    recentP2Fx,
  );
  h.homeFakes.postRepository.onDetail(postOct31, [
    Reply.ok(_asPost(detailFx(detailMineTodayFx), postOct31)),
  ]);
  h.homeFakes.displayRepository.servePage(
    today,
    DisplaySort.recent,
    1,
    recentP1Fx,
  );
  h.homeFakes.displayRepository.servePage(
    today,
    DisplaySort.recent,
    2,
    recentP2Fx,
  );
  h.homeFakes.displayRepository.servePage(
    const KstDate(2026, 10, 20),
    DisplaySort.recent,
    1,
    recentP1Fx,
  );
  h.homeFakes.postRepository.onDelete(postOct31, [Reply.ok(null)]);
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
  return h;
}

Future<void> _settle(WidgetTester tester, {int ticks = 12}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  widgetTest('TC-REC-025 홈 이번 주 칸을 누르면 기록 탭이 그 날짜를 선택한 채 열린다', (tester) async {
    await _enterMain(tester);
    await tester.tap(byId(HomeTestIds.weekDay('2026-10-27')));
    await _settle(tester);
    expect(byId(RecordTestIds.root), findsOneWidget);
    // 최신 사진(10/31, APPROVED)이 아니라 요청한 10/27(PENDING)이 선택된다.
    expect(byId(RecordTestIds.pendingBadge), findsOneWidget);
    expect(byId(RecordTestIds.viewFeedButton), findsNothing);
  });

  widgetTest('TC-REC-001 TC-REC-022 기록 탭을 처음 열면 불러오고 다시 들어오면 재검증한다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    final api = h.homeFakes.api;
    final before = api.calendarCalls;
    await tester.tap(byId(NavigationTestIds.tabRecord));
    await _settle(tester);
    expect(byId(RecordTestIds.selectedPhoto), findsOneWidget);
    expect(api.calendarCalls, before + 1);

    await tester.tap(byId(NavigationTestIds.tabHome));
    await _settle(tester);
    await tester.tap(byId(NavigationTestIds.tabRecord));
    await _settle(tester);
    expect(byId(RecordTestIds.selectedPhoto), findsOneWidget);
    expect(api.calendarCalls, greaterThan(before + 1));
  });

  widgetTest('TC-REC-034 TC-REC-036 피드에서 보기는 내 게시물 상세를 열고 뒤로 가면 기록을 재검증한다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabRecord));
    await _settle(tester);
    final calls = h.homeFakes.api.calendarCalls;

    await tester.tap(byId(RecordTestIds.viewFeedButton));
    await _settle(tester);
    expect(byId(FeedTestIds.root), findsOneWidget);
    expect(h.homeFakes.postRepository.detailCalls, [postOct31]);

    await tester.tap(byId(FeedTestIds.backButton));
    await _settle(tester);
    expect(byId(FeedTestIds.root), findsNothing);
    expect(byId(RecordTestIds.root), findsOneWidget);
    expect(h.homeFakes.api.calendarCalls, greaterThan(calls));
    expect(byId(RecordTestIds.selectedPhoto), findsOneWidget);
  });

  widgetTest('TC-REC-034 전시 보러가기는 전시 탭을 그 사진의 주제 날짜로 연다', (tester) async {
    final h = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabRecord));
    await _settle(tester);
    await tester.tap(byId(RecordTestIds.day('2026-10-20')));
    await _settle(tester);
    await tester.tap(byId(RecordTestIds.viewDisplayButton));
    await _settle(tester);
    expect(byId(DisplayTestIds.root), findsOneWidget);
    final display = h.homeFakes.displayRepository;
    const date = KstDate(2026, 10, 20);
    expect([
      ...display.callsFor(DisplaySort.recent, date: date),
      ...display.callsFor(DisplaySort.popular, date: date),
    ], isNotEmpty);
  });

  widgetTest('TC-REC-024 TC-FEED-044 피드에서 삭제하면 돌아온 기록에서 그 사진이 사라진다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabRecord));
    await _settle(tester);
    expect(byId(RecordTestIds.day('2026-10-31')), findsOneWidget);
    expect(
      find.descendant(
        of: byId(RecordTestIds.day('2026-10-31')),
        matching: find.byType(Image),
      ),
      findsOneWidget,
    );
    // 서버도 삭제 뒤 응답에서 그 사진을 뺀다.
    h.homeFakes.api.calendar(2026, 10, [
      fx('record/posts-calendar__2026-10-after-delete.json'),
    ]);

    await tester.tap(byId(RecordTestIds.viewFeedButton));
    await _settle(tester);
    await tester.tap(byId(FeedTestIds.deleteButton));
    await _settle(tester);
    await tester.tap(byId(FeedTestIds.deleteConfirmButton));
    await _settle(tester);

    expect(byId(FeedTestIds.root), findsNothing);
    expect(byId(RecordTestIds.root), findsOneWidget);
    expect(
      find.descendant(
        of: byId(RecordTestIds.day('2026-10-31')),
        matching: find.byType(Image),
      ),
      findsNothing,
    );
  });
}

/// fixture 상세를 기록 사진의 postId로 바꾼다(기록의 postId와 상세 id가 같아야 상세가 열린다).
PostDetail _asPost(PostDetail d, String id) => PostDetail(
  id: id,
  authorId: d.authorId,
  topicId: d.topicId,
  topicTitle: d.topicTitle,
  topicDate: d.topicDate,
  originalImageUrl: d.originalImageUrl,
  thumbnailImageUrl: d.thumbnailImageUrl,
  signatureOriginalImageUrl: d.signatureOriginalImageUrl,
  title: d.title,
  likeCount: d.likeCount,
  isLiked: d.isLiked,
);
