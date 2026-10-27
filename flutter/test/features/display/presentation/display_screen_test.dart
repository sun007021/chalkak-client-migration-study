import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_screen.dart';
import 'package:chalkak/features/display/presentation/display_test_ids.dart';
import 'package:chalkak/features/feed/domain/feed_target.dart';
import 'package:chalkak/features/like/domain/toast_message.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';

final _yesterday = day('2026-10-26');
final _first = postIdOf(2);

class _Screen {
  _Screen(this.rig);
  final DisplayRig rig;
  final List<ToastMessage> toasts = [];
  final List<FeedTarget> opened = [];
}

Future<_Screen> _open(
  WidgetTester tester, {
  bool guest = false,
  bool manualLikes = false,
  KstDate? date,
  bool load = true,
  void Function(DisplayRig rig)? script,
}) async {
  final rig = DisplayRig(
    guest: guest,
    manualLikes: manualLikes,
    initialDate: date,
  );
  rig.repo.servePage(today, DisplaySort.recent, 1, recentP1Fx);
  rig.repo.servePage(today, DisplaySort.recent, 2, recentP2Fx);
  rig.repo.servePage(today, DisplaySort.popular, 1, popularP1Fx);
  rig.repo.servePage(_yesterday, DisplaySort.popular, 1, popularP1Fx);
  rig.repo.servePage(day('2026-09-17'), DisplaySort.popular, 1, popular3Fx);
  rig.likeRepo.seedServer(_first, likeCount: 38);
  script?.call(rig);
  addTearDown(rig.vm.dispose);
  final s = _Screen(rig);
  await pumpScreen(
    tester,
    DisplayScreen(
      viewModel: rig.vm,
      onToast: s.toasts.add,
      onOpenFeed: s.opened.add,
    ),
  );
  if (load) {
    unawaited(rig.vm.load());
    await settleUi(tester);
  }
  return s;
}

Finder _in(String id, Finder matching) =>
    find.descendant(of: byId(id), matching: matching);

double _gridOffset(WidgetTester tester) => tester
    .state<ScrollableState>(
      find
          .descendant(
            of: byId(DisplayTestIds.grid),
            matching: find.byType(Scrollable),
          )
          .first,
    )
    .position
    .pixels;

void main() {
  group('상태별 화면', () {
    widgetTest('TC-DISP-001 첫 로딩 중에는 로딩 표시만 있고 날짜 이동 버튼이 비활성이다', (
      tester,
    ) async {
      await _open(
        tester,
        script: (r) => r.repo.onPosts(today, DisplaySort.recent, 1, [
          Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 1)),
        ]),
      );
      expect(byId(DisplayTestIds.root), findsOneWidget);
      expect(byId(DisplayTestIds.loading), findsOneWidget);
      expect(byId(DisplayTestIds.emptyState), findsNothing);
      expect(byId(DisplayTestIds.errorState), findsNothing);
      expect(isEnabled(tester, DisplayTestIds.prevDateButton), isFalse);
      expect(isEnabled(tester, DisplayTestIds.nextDateButton), isFalse);
      await tester.pump(const Duration(seconds: 2));
      expect(byId(DisplayTestIds.loading), findsNothing);
      expect(byId(DisplayTestIds.grid), findsOneWidget);
    });

    widgetTest('TC-DISP-005 실패하면 오류 상태와 다시 시도가 보이고 누르면 다시 불러온다', (
      tester,
    ) async {
      final s = await _open(
        tester,
        script: (r) => r.repo.onPosts(today, DisplaySort.recent, 1, [
          Reply.fail(errorFx(posts500Fx)),
          Reply.ok(pageFx(recentP1Fx)),
        ]),
      );
      expect(byId(DisplayTestIds.errorState), findsOneWidget);
      expect(find.text(Copy.displayError), findsOneWidget);
      expect(byId(DisplayTestIds.retryButton), findsOneWidget);
      expect(find.text(Copy.displayRetry), findsOneWidget);
      expect(byId(DisplayTestIds.grid), findsNothing);
      await tester.tap(byId(DisplayTestIds.retryButton));
      await settleUi(tester);
      expect(byId(DisplayTestIds.errorState), findsNothing);
      expect(byId(DisplayTestIds.grid), findsOneWidget);
      expect(s.rig.repo.postsCalls, hasLength(2));
    });

    widgetTest('TC-DISP-006 주제가 없으면 빈 상태 문구가 보이고 오류 화면이 아니다', (tester) async {
      await _open(
        tester,
        script: (r) => r.repo.onTopic(today, [Reply.fail(errorFx(topic404Fx))]),
      );
      expect(byId(DisplayTestIds.emptyState), findsOneWidget);
      expect(find.text(Copy.displayEmpty), findsOneWidget);
      expect(byId(DisplayTestIds.errorState), findsNothing);
      expect(isEnabled(tester, DisplayTestIds.prevDateButton), isTrue);
    });

    widgetTest('TC-DISP-007 posts가 404여도 빈 상태이고 다시 시도 버튼은 없다', (tester) async {
      await _open(
        tester,
        script: (r) => r.repo.onPosts(today, DisplaySort.recent, 1, [
          Reply.fail(errorFx(posts404Fx)),
        ]),
      );
      expect(byId(DisplayTestIds.emptyState), findsOneWidget);
      expect(byId(DisplayTestIds.retryButton), findsNothing);
      expect(isEnabled(tester, DisplayTestIds.prevDateButton), isTrue);
    });
  });

  group('머리글과 날짜 이동', () {
    widgetTest('TC-DISP-041 날짜 라벨·주제 제목·오늘 설명 문구가 보인다', (tester) async {
      await _open(tester);
      expect(
        _in(DisplayTestIds.dateLabel, find.text('10월 27일')),
        findsOneWidget,
      );
      expect(
        _in(DisplayTestIds.topicTitle, find.text('주제 2026-10-27')),
        findsOneWidget,
      );
      expect(
        _in(
          DisplayTestIds.description,
          find.text(Copy.displayHeaderDescLatest),
        ),
        findsOneWidget,
      );
    });

    widgetTest('TC-DISP-029 오늘에서는 다음 버튼이 비활성이고 이전 버튼을 누르면 어제로 이동한다', (
      tester,
    ) async {
      final s = await _open(tester);
      expect(isEnabled(tester, DisplayTestIds.nextDateButton), isFalse);
      expect(isEnabled(tester, DisplayTestIds.prevDateButton), isTrue);
      await tester.tap(byId(DisplayTestIds.prevDateButton));
      await settleUi(tester);
      expect(s.rig.state.selectedDate, _yesterday);
      expect(
        _in(DisplayTestIds.dateLabel, find.text('10월 26일')),
        findsOneWidget,
      );
      expect(isEnabled(tester, DisplayTestIds.nextDateButton), isTrue);
    });

    widgetTest('TC-DISP-028 최초 전시일에서는 이전 버튼이 비활성이다', (tester) async {
      await _open(tester, date: KstDate.firstTopic);
      expect(isEnabled(tester, DisplayTestIds.prevDateButton), isFalse);
      expect(isEnabled(tester, DisplayTestIds.nextDateButton), isTrue);
    });

    widgetTest('TC-DISP-036 날짜 라벨 옆 버튼을 누르면 날짜 선택 시트가 열린다', (tester) async {
      await _open(tester);
      expect(byId(DisplayTestIds.datePickerSheet), findsNothing);
      await tester.tap(byId(DisplayTestIds.datePickerButton));
      await settleUi(tester);
      expect(byId(DisplayTestIds.datePickerSheet), findsOneWidget);
      expect(find.text(Copy.displayPickerTitle), findsOneWidget);
    });
  });

  group('정렬 탭과 아카이브', () {
    widgetTest('TC-DISP-011 오늘은 정렬 탭 3개가 보이고 기본은 최신순이며 누르면 선택이 옮겨 간다', (
      tester,
    ) async {
      final s = await _open(tester);
      for (final id in [
        DisplayTestIds.sortRecentTab,
        DisplayTestIds.sortPopularTab,
        DisplayTestIds.sortRandomTab,
      ]) {
        expect(byId(id), findsOneWidget);
      }
      expect(find.text(Copy.displaySortRecent), findsOneWidget);
      expect(find.text(Copy.displaySortPopular), findsOneWidget);
      expect(find.text(Copy.displaySortRandom), findsOneWidget);
      expect(isSelected(tester, DisplayTestIds.sortRecentTab), isTrue);
      expect(isSelected(tester, DisplayTestIds.sortPopularTab), isFalse);
      await tester.tap(byId(DisplayTestIds.sortPopularTab));
      await settleUi(tester);
      expect(isSelected(tester, DisplayTestIds.sortPopularTab), isTrue);
      expect(isSelected(tester, DisplayTestIds.sortRecentTab), isFalse);
      expect(s.rig.repo.postsCalls.last.sort, DisplaySort.popular);
    });

    widgetTest('TC-DISP-013 지난 날짜는 정렬 탭이 없고 추천 페이저와 아카이브 설명이 보인다', (
      tester,
    ) async {
      await _open(tester, date: _yesterday);
      expect(byId(DisplayTestIds.sortRecentTab), findsNothing);
      expect(byId(DisplayTestIds.sortPopularTab), findsNothing);
      expect(byId(DisplayTestIds.sortRandomTab), findsNothing);
      expect(byId(DisplayTestIds.featuredPager), findsOneWidget);
      expect(byId(DisplayTestIds.featuredItem(_first)), findsOneWidget);
      expect(
        _in(
          DisplayTestIds.description,
          find.text(Copy.displayHeaderDescArchive),
        ),
        findsOneWidget,
      );
    });

    widgetTest('TC-DISP-013 오늘은 추천 페이저가 없다', (tester) async {
      await _open(tester);
      expect(byId(DisplayTestIds.featuredPager), findsNothing);
    });

    widgetTest('TC-DISP-043 아카이브 사진이 3장뿐이어도 추천 페이저가 깨지지 않는다', (tester) async {
      await _open(
        tester,
        date: _yesterday,
        script: (r) =>
            r.repo.servePage(_yesterday, DisplaySort.popular, 1, popular3Fx),
      );
      expect(byId(DisplayTestIds.featuredPager), findsOneWidget);
      expect(
        byId(DisplayTestIds.featuredItem(idsOf(popular3Fx).first)),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('그리드', () {
    widgetTest('TC-DISP-060 그리드 항목·좋아요 버튼·좋아요 수 testID가 있다', (tester) async {
      await _open(tester);
      expect(byId(DisplayTestIds.grid), findsOneWidget);
      expect(byId(DisplayTestIds.item(_first)), findsOneWidget);
      expect(byId(DisplayTestIds.likeButton(_first)), findsOneWidget);
      expect(
        _in(DisplayTestIds.likeCount(_first), find.text('38')),
        findsOneWidget,
      );
      expect(isSelected(tester, DisplayTestIds.likeButton(_first)), isFalse);
      expect(
        isSelected(tester, DisplayTestIds.likeButton(postIdOf(3))),
        isTrue,
        reason: '내가 좋아요한 사진은 selected',
      );
    });

    widgetTest('TC-DISP-055 사진을 누르면 상세 열기가 목록 값을 시드로 전달된다', (tester) async {
      final s = await _open(tester);
      await tester.tap(byId(DisplayTestIds.item(_first)));
      await settleUi(tester);
      expect(s.opened.single.postId, _first);
      expect(s.opened.single.seed!.likeCount, 38);
    });

    widgetTest('TC-DISP-054 게스트가 사진을 누르면 토스트만 전달되고 상세는 열리지 않는다', (
      tester,
    ) async {
      final s = await _open(tester, guest: true);
      await tester.tap(byId(DisplayTestIds.item(_first)));
      await settleUi(tester);
      expect(s.opened, isEmpty);
      expect([for (final t in s.toasts) t.text], [Copy.guestFeed]);
    });

    widgetTest('TC-LIKE-003 하트를 누르면 응답 전에 수와 selected가 바뀐다', (tester) async {
      final s = await _open(tester, manualLikes: true);
      await tester.tap(byId(DisplayTestIds.likeButton(_first)));
      await settleUi(tester);
      expect(
        _in(DisplayTestIds.likeCount(_first), find.text('39')),
        findsOneWidget,
      );
      expect(isSelected(tester, DisplayTestIds.likeButton(_first)), isTrue);
      expect(s.rig.likeRepo.putCount, 1);
    });

    widgetTest('TC-LIKE-030 좋아요 실패 토스트가 같은 문구로 연달아 전달돼도 둘 다 전달된다', (
      tester,
    ) async {
      final s = await _open(tester, manualLikes: true);
      final second = postIdOf(4);
      s.rig.likeRepo.seedServer(second, likeCount: 36);
      await tester.tap(byId(DisplayTestIds.likeButton(_first)));
      await tester.tap(byId(DisplayTestIds.likeButton(second)));
      await settleUi(tester);
      s.rig.likeRepo.calls[0].fail(networkError());
      s.rig.likeRepo.calls[1].fail(networkError());
      await settleUi(tester);
      expect(
        [for (final t in s.toasts) t.text],
        [Copy.likeErrorGeneric, Copy.likeErrorGeneric],
      );
      expect(s.toasts[0].id, isNot(s.toasts[1].id));
    });

    widgetTest('TC-LIKE-014 게스트가 하트를 누르면 토스트만 전달되고 요청이 없다', (tester) async {
      final s = await _open(tester, guest: true, manualLikes: true);
      await tester.tap(byId(DisplayTestIds.likeButton(_first)));
      await settleUi(tester);
      expect([for (final t in s.rig.likeToasts) t.text], [Copy.guestLike]);
      expect(s.rig.likeRepo.callCount, 0);
    });

    widgetTest('TC-DISP-022 끝 근처까지 스크롤하면 다음 페이지를 요청한다', (tester) async {
      final s = await _open(tester);
      expect(s.rig.repo.postsCalls.where((c) => c.page == 2), isEmpty);
      await tester.drag(byId(DisplayTestIds.grid), const Offset(0, -6000));
      await settleUi(tester);
      expect(s.rig.repo.postsCalls.where((c) => c.page == 2), hasLength(1));
    });

    widgetTest('TC-DISP-022 다음 페이지를 불러오는 동안 하단 로딩 표시가 있다', (tester) async {
      final s = await _open(
        tester,
        script: (r) => r.repo.onPosts(today, DisplaySort.recent, 2, [
          Reply.ok(pageFx(recentP2Fx), delay: const Duration(seconds: 1)),
        ]),
      );
      expect(byId(DisplayTestIds.loadMoreIndicator), findsNothing);
      await tester.drag(byId(DisplayTestIds.grid), const Offset(0, -6000));
      await settleUi(tester);
      expect(byId(DisplayTestIds.loadMoreIndicator), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await settleUi(tester);
      expect(byId(DisplayTestIds.loadMoreIndicator), findsNothing);
      expect(s.rig.itemIds, hasLength(27));
    });

    widgetTest('TC-DISP-044 재검증 중에는 새로고침 표시가 있고 기존 사진을 유지한다', (tester) async {
      final s = await _open(tester);
      s.rig.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.ok(pageFx(recentP1Fx), delay: const Duration(seconds: 1)),
      ]);
      unawaited(s.rig.vm.onReturnedFromFeed());
      await settleUi(tester, frames: 3);
      expect(byId(DisplayTestIds.refreshIndicator), findsOneWidget);
      expect(byId(DisplayTestIds.item(_first)), findsOneWidget);
      await tester.pump(const Duration(seconds: 2));
      await settleUi(tester);
      expect(byId(DisplayTestIds.refreshIndicator), findsNothing);
    });

    widgetTest('TC-DISP-044 전시 탭을 다시 누르면 그리드가 맨 위로 이동한다', (tester) async {
      final s = await _open(tester);
      await tester.drag(byId(DisplayTestIds.grid), const Offset(0, -600));
      await settleUi(tester);
      expect(_gridOffset(tester), greaterThan(0));
      unawaited(s.rig.vm.onTabReselected());
      await tester.pump(const Duration(milliseconds: 600));
      await settleUi(tester);
      expect(_gridOffset(tester), 0);
    });

    widgetTest('TC-DISP-010 재검증 실패는 화면에 토스트로 전달되고 오류 화면으로 바뀌지 않는다', (
      tester,
    ) async {
      final s = await _open(tester);
      s.rig.repo.onPosts(today, DisplaySort.recent, 1, [
        Reply.fail(errorFx(posts500Fx)),
      ]);
      unawaited(s.rig.vm.onReturnedFromFeed());
      await settleUi(tester);
      expect(byId(DisplayTestIds.errorState), findsNothing);
      expect(byId(DisplayTestIds.item(_first)), findsOneWidget);
      expect([for (final t in s.toasts) t.text], [Copy.displayError]);
    });
  });
}
